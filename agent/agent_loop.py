"""
agent_loop.py - 核心 ReAct 循环
"""
import json
from pathlib import Path

from tool import (
    is_dangerous,
    default_permission_callback,
)
from tool import microcompact, auto_compact, estimate_tokens
from tool._tools_impl import _summarize_handler
from agent._react import execute_tools


# ==================== 事件回调接口 ====================

class EventCallback:
    """
    事件回调 — 用于可视化 UI 或日志记录。
    每个方法都是可选的，默认为空实现。
    """

    def on_thinking(self, content: str):
        pass

    def on_tool_call(self, tool_name: str, input: dict):
        pass

    def on_tool_result(self, tool_name: str, output: str):
        pass

    def on_compact(self):
        pass

    def on_inbox(self, messages: list):
        pass

    def on_bg_result(self, results: list):
        pass

    def on_loop_end(self, final_content: str):
        pass


class PrintEventCallback(EventCallback):
    """调试用：打印所有事件到 stdout"""

    def on_thinking(self, content: str):
        if content.strip():
            print(f"[thinking] {content[:200]}")

    def on_tool_call(self, tool_name: str, input: dict):
        print(f"[tool] {tool_name}({json.dumps(input, ensure_ascii=False)[:100]})")

    def on_tool_result(self, tool_name: str, output: str):
        print(f"[tool.result] {tool_name}: {str(output)[:150]}")

    def on_compact(self):
        print("[compact] auto-compact triggered")

    def on_inbox(self, messages: list):
        print(f"[inbox] {len(messages)} messages")

    def on_bg_result(self, results: list):
        print(f"[bg] {len(results)} background results")

    def on_loop_end(self, final_content: str):
        print(f"[end] {final_content[:200] if final_content else '(no output)'}")


class EventCollector(EventCallback):
    """
    收集所有事件，用于可视化 UI 或回放。
    run() 返回值就是这个。
    """

    def __init__(self):
        self.events = []          # 所有事件的列表
        self.thinking = ""       # 当前思考文本
        self.tool_calls = []     # [{name, input, output}, ...]
        self.final_content = ""   # 最终文本
        self.compact_count = 0    # 压缩次数
        self.round_count = 0      # 轮次

    def on_thinking(self, content: str):
        self.thinking = content
        self.events.append({"type": "thinking", "content": content})

    def on_tool_call(self, tool_name: str, input: dict):
        self.tool_calls.append({"name": tool_name, "input": input, "output": None})
        self.events.append({"type": "tool_call", "name": tool_name, "input": input})

    def on_tool_result(self, tool_name: str, output: str):
        if self.tool_calls and self.tool_calls[-1]["name"] == tool_name and self.tool_calls[-1]["output"] is None:
            self.tool_calls[-1]["output"] = str(output)[:500]
        self.events.append({"type": "tool_result", "name": tool_name, "output": str(output)[:500]})

    def on_compact(self):
        self.compact_count += 1
        self.events.append({"type": "compact"})
        self.thinking = ""
        self.tool_calls = []

    def on_inbox(self, messages: list):
        self.events.append({"type": "inbox", "messages": messages})

    def on_bg_result(self, results: list):
        self.events.append({"type": "bg_result", "results": results})

    def on_loop_end(self, final_content: str):
        self.final_content = final_content or ""
        self.events.append({"type": "end", "content": self.final_content})

    def summary(self) -> dict:
        """返回一个可读的摘要"""
        return {
            "round_count": self.round_count,
            "compact_count": self.compact_count,
            "tool_call_count": len(self.tool_calls),
            "tool_names": [t["name"] for t in self.tool_calls],
            "final_content": self.final_content[:500],
        }


# ==================== 运行结果 ====================

class RunResult:
    """
    run() 的返回值，包含最终文本和所有收集的事件。
    """

    def __init__(self, content: str, collector: EventCollector):
        self.content = content        # 最终 assistant 响应文本
        self.events = collector.events          # 所有事件列表
        self.thinking = collector.thinking       # 最后一段思考
        self.tool_calls = collector.tool_calls   # 所有工具调用
        self.final_content = collector.final_content  # 最终文本
        self.compact_count = collector.compact_count # 压缩次数
        self.round_count = collector.round_count     # 总轮次

    def summary(self) -> dict:
        return {
            "round_count": self.round_count,
            "compact_count": self.compact_count,
            "tool_call_count": len(self.tool_calls),
            "tool_names": [t["name"] for t in self.tool_calls],
            "final_content": self.final_content[:500],
        }


# ==================== 主循环 ====================

def agent_loop(
    messages: list,
    llm_adapter,
    config: dict,
    ctx=None,
    permission_callback=None,
    event_callback: EventCallback = None,
):
    """
    核心 ReAct 循环

    参数:
        messages:             对话历史列表，会被原地修改
        llm_adapter:         LLM 适配器（AnthropicAdapter / OpenAIAdapter 等）
        config:              配置字典，包含:
            - system:          str   系统提示词
            - tools:           list  工具列表（由 PlanAgent 注入）
            - handlers:         dict  工具 handler（由 PlanAgent 注入）
            - model:           str   模型名称
            - max_tokens:       int   最大输出 token 数
            - token_threshold:  int   压缩阈值（默认 100000）
        ctx:                 AgentContext 实例（不传则使用全局单例）
        permission_callback:  危险命令确认回调
        event_callback:       EventCallback 实例（可选，用于可视化 UI）
    """
    if permission_callback is None:
        permission_callback = default_permission_callback
    if event_callback is None:
        event_callback = EventCallback()

    # 优先用传入的 ctx，否则 fallback 到全局单例
    if ctx is None:
        from tool import get_todo, get_bg, get_bus
        todo_mgr = get_todo()
        bg_mgr = get_bg()
        bus_mgr = get_bus()
        token_threshold = config.get("token_threshold", 100000)
    else:
        todo_mgr = ctx.todo
        bg_mgr = ctx.bg
        bus_mgr = ctx.bus
        token_threshold = config.get("token_threshold", 100000)

    rounds_without_todo = 0
    system = config["system"]
    tools = config.get("tools", [])
    model = config["model"]
    max_tokens = config.get("max_tokens", 8000)
    llm_timeout = config.get("llm_timeout", 120)
    workdir = ctx.workdir if ctx else Path.cwd()

    handlers = config.get("handlers", {})
    _summarize_handler.init(messages, workdir, llm_adapter, model)
    allow_all_dangerous_ref = [False]

    while True:
        event_callback.round_count += 1
        # 1. 轻量压缩
        microcompact(messages)

        # 2. token 超阈值则自动压缩
        if estimate_tokens(messages) > token_threshold:
            event_callback.on_compact()
            messages[:] = auto_compact(
                messages,
                workdir=workdir,
                llm_adapter=llm_adapter,
                model=model,
            )

        # 3. 回收后台任务结果
        task_result = bg_mgr.drain()
        if task_result:
            event_callback.on_bg_result(task_result)
            txt = "\n".join(
                f"[bg:{n['task_id']}] {n['status']}: {n['result']}"
                for n in task_result
            )
            messages.append({
                "role": "user",
                "content": f"<background-results>\n{txt}\n</background-results>"
            })

        # 4. 读取收件箱
        messages_received = bus_mgr.read_inbox("lead")
        if messages_received:
            event_callback.on_inbox(messages_received)
            result_msgs = [m for m in messages_received if m.get("type") == "result"]
            if result_msgs:
                teammate_reports = []
                for m in result_msgs:
                    from_name = m.get("from", "teammate")
                    content = m.get("content", "")
                    teammate_reports.append(f"=== Report from {from_name} ===\n{content}")
                messages.append({
                    "role": "user",
                    "content": f"<teammate-reports>\n" + "\n\n".join(teammate_reports) + "\n</teammate-reports>"
                })
            other_msgs = [m for m in messages_received if m.get("type") != "result"]
            if other_msgs:
                messages.append({
                    "role": "user",
                    "content": f"<inbox>{json.dumps(other_msgs, indent=2)}</inbox>"
                })

        # 5. 调用大模型
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
            return RunResult(f"LLM error: {e}", event_callback)

        assistant_content = response.assistant_content if getattr(response, "assistant_content", None) is not None else response.content
        messages.append({"role": "assistant", "content": assistant_content})

        # 发出思考事件
        if response.content:
            event_callback.on_thinking(response.content)

        # 不是工具调用 → 结束
        if response.stop_reason != "tool_use":
            event_callback.on_loop_end(response.content)
            return RunResult(response.content, event_callback)

        # 6. 执行工具调用
        used_todo = False

        # 先发出每个工具的调用事件
        for block in (response.tool_uses or []):
            event_callback.on_tool_call(block.name, block.input)

        results, skip_results_append = execute_tools(
            tool_uses=response.tool_uses,
            handlers=handlers,
            permission_callback=permission_callback,
            allow_all_dangerous_ref=allow_all_dangerous_ref,
            summarize_handler=_summarize_handler,
            tool_name_prefix="> ",
        )

        # 发出每个工具的结果事件
        for i, block in enumerate((response.tool_uses or [])):
            if i < len(results):
                event_callback.on_tool_result(block.name, results[i]["content"])

        for block in (response.tool_uses or []):
            if block.name == "TodoWrite":
                used_todo = True

        # 7. todo nag 提醒
        rounds_without_todo = 0 if used_todo else rounds_without_todo + 1
        if todo_mgr.has_open_items() and rounds_without_todo >= 3:
            results.append({"type": "text", "text": "<reminder>Update your todos.</reminder>"})

        # 8. 工具结果注入上下文（summarize 已 in-place 修改 messages，跳过）
        if not skip_results_append:
            messages.append({"role": "user", "content": results})
