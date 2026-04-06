"""
teammate_loop.py - 子 Agent（Teammate）主循环
"""
import json
import time
from pathlib import Path

from tool import (
    FILE_TOOLS,
    FILE_HANDLERS,
    is_dangerous,
    default_permission_callback,
)
from tool._tools_impl import _summarize_handler
from agent._react import execute_tools


def teammate_loop(
    name: str,
    role: str,
    prompt: str,
    llm_adapter,
    config: dict,
    tasks_dir: Path,
    ctx=None,
    team=None,
    idle_timeout: int = 60,
    poll_interval: int = 5,
    permission_callback=None,
):
    """
    Teammate 主循环（独立运行在子线程中）

    参数:
        name:                 teammate 名字
        role:                 teammate 角色
        prompt:               初始任务描述
        llm_adapter:         LLM 适配器
        config:              配置字典，包含:
            - system:          str   系统提示词
            - tools:           list  自定义工具列表（可选，默认只有 FILE_TOOLS）
            - handlers:         dict  自定义工具处理函数（可选）
            - model:           str   模型名称
            - max_tokens:       int   最大输出 token
        tasks_dir:           任务文件目录
        ctx:                 AgentContext 实例（可选，不传则用全局单例）
        team:                TeammateManager 实例（用于更新状态，可选）
        idle_timeout:         空闲超时秒数（默认 60）
        poll_interval:         轮询间隔秒数（默认 5）
        permission_callback:    危险命令确认回调
    """
    if permission_callback is None:
        permission_callback = default_permission_callback

    # 优先用传入的 ctx，否则 fallback 到全局单例
    if ctx is None:
        from tool import get_bg, get_bus, get_task_mgr
        bus = get_bus()
        task_mgr = get_task_mgr()
    else:
        bus = ctx.bus
        task_mgr = ctx.task_mgr

    # 放行所有危险命令的会话级开关（用列表引用以便在 execute_tools 中修改）
    allow_all_dangerous_ref = [False]

    # 默认文件工具 + 自定义工具合并
    tools = FILE_TOOLS + (config.get("tools") or [])
    custom_handlers = config.get("handlers", {})
    handlers = {**FILE_HANDLERS, **custom_handlers}

    system = config["system"]
    model = config["model"]
    max_tokens = config.get("max_tokens", 8000)
    llm_timeout = config.get("llm_timeout", 120)
    work_phase_rounds = config.get("work_phase_rounds", 50)

    messages = [{"role": "user", "content": prompt}]

    # 为 summarize handler 注入上下文（通过闭包）
    workdir = ctx.workdir if ctx else (tasks_dir.parent if tasks_dir else Path.cwd())
    _summarize_handler.init(messages, workdir, llm_adapter, model)

    # teammate 特殊工具的 handler（idle / claim_task / send_message）
    def _idle_handler(block, input_d):
        return "Entering idle phase."

    def _claim_task_handler(block, input_d):
        return task_mgr.claim(block.input["task_id"], name)

    def _send_message_handler(block, input_d):
        return bus.send(name, block.input["to"], block.input["content"])

    extra_handlers = {
        "idle": lambda **k: "Entering idle phase.",
        "claim_task": lambda **k: task_mgr.claim(k["task_id"], name),
        "send_message": lambda **k: bus.send(name, k["to"], k["content"]),
    }

    def _exit_with_result(reason: str):
        """收集消息历史构建摘要，发送给 lead，更新状态后退出线程"""
        summary_parts = []
        for msg in messages:
            if msg.get("role") == "assistant":
                content = msg.get("content", "")
                if isinstance(content, str) and content:
                    summary_parts.append(content)
            elif msg.get("role") == "user":
                content = msg.get("content", "")
                # 收集最近的 tool_result
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "tool_result":
                            summary_parts.append(f"[tool: {part.get('content', '')}]")
                elif isinstance(content, str) and content:
                    summary_parts.append(content)
        summary = "\n".join(summary_parts) if summary_parts else "(no output)"
        bus.send(name, "lead", f"[{reason}]\n{summary}", "result")
        if team:
            team.set_status(name, "shutdown")
        return

    def _tool_name_prefix():
        return f"  [{name}] "

    # WORK PHASE ←→ IDLE PHASE 循环
    while True:
        # ===================== WORK PHASE =====================
        for _ in range(work_phase_rounds):
            # 1. 检查收件箱
            inbox = bus.read_inbox(name)
            for msg in inbox:
                msg_type = msg.get("type")
                if msg_type == "shutdown_request":
                    _exit_with_result("shutdown_requested")
                    return
                messages.append({"role": "user", "content": json.dumps(msg)})

            # 2. 调用 LLM
            try:
                response = llm_adapter.create(
                    model=model,
                    system=system,
                    messages=messages,
                    tools=tools,
                    max_tokens=max_tokens,
                    timeout=llm_timeout,
                )
            except Exception as e:
                _exit_with_result(f"error: {e}")
                return

            assistant_content = response.assistant_content if getattr(response, "assistant_content", None) is not None else response.content
            messages.append({"role": "assistant", "content": assistant_content})

            if response.stop_reason != "tool_use":
                break

            # 3. 执行工具调用（公共逻辑 + teammate 特殊工具）
            all_handlers = {**handlers, **extra_handlers}
            results, skip_results_append = execute_tools(
                tool_uses=response.tool_uses,
                handlers=all_handlers,
                permission_callback=permission_callback,
                allow_all_dangerous_ref=allow_all_dangerous_ref,
                summarize_handler=_summarize_handler,
                tool_name_prefix=_tool_name_prefix(),
            )

            # 检查 idle 标记（teammate 特殊）
            idle_requested = any(
                b.name == "idle" for b in (response.tool_uses or [])
            )

            if not skip_results_append:
                messages.append({"role": "user", "content": results})

            if idle_requested:
                break

        # ===================== IDLE PHASE =====================
        if team:
            team.set_status(name, "idle")
        resume = False
        for _ in range(idle_timeout // max(poll_interval, 1)):
            time.sleep(poll_interval)

            inbox = bus.read_inbox(name)
            if inbox:
                for msg in inbox:
                    if msg.get("type") == "shutdown_request":
                        _exit_with_result("shutdown_requested")
                        return
                    messages.append({"role": "user", "content": json.dumps(msg)})
                if team:
                    team.set_status(name, "working")
                resume = True
                break

            unclaimed = []
            if tasks_dir.exists():
                for f in sorted(tasks_dir.glob("task_*.json")):
                    t = json.loads(f.read_text(encoding="utf-8"))
                    if (t.get("status") == "pending"
                            and not t.get("owner")
                            and not t.get("blockedBy")):
                        unclaimed.append(t)

            if unclaimed:
                task = unclaimed[0]
                task_mgr.claim(task["id"], name)

                # 上下文被压缩后，注入身份信息
                if len(messages) <= 3:
                    messages.insert(0, {"role": "user", "content": f"<identity>You are '{name}', role: {role}.</identity>"})
                    messages.insert(1, {"role": "assistant", "content": f"I am {name}. Continuing."})

                messages.append({
                    "role": "user",
                    "content": f"<auto-claimed>Task #{task['id']}: {task['subject']}\n{task.get('description', '')}</auto-claimed>"
                })
                messages.append({
                    "role": "assistant",
                    "content": f"Claimed task #{task['id']}. Working on it."
                })
                resume = True
                break

        if not resume:
            _exit_with_result("idle_timeout")
            return

        # 继续 WORK PHASE
