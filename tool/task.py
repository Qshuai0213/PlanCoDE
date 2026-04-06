"""
task.py - TaskManager 和 _task_handler（同步子 agent）
"""
import json
import os
import uuid
from pathlib import Path

from .bus import MessageBus


class TaskManager:
    """文件持久化任务管理器"""

    def __init__(self, tasks_dir: Path = None):
        self._tasks_dir = tasks_dir or (Path.cwd() / ".tasks")
        self._tasks_dir.mkdir(exist_ok=True)

    def _next_id(self) -> int:
        ids = [int(f.stem.split("_")[1]) for f in self._tasks_dir.glob("task_*.json")]
        return max(ids, default=0) + 1

    def _load(self, tid: int) -> dict:
        p = self._tasks_dir / f"task_{tid}.json"
        if not p.exists():
            raise ValueError(f"Task {tid} not found")
        return json.loads(p.read_text(encoding="utf-8"))

    def _save(self, task: dict):
        p = self._tasks_dir / f"task_{task['id']}.json"
        tmp = p.with_suffix(".tmp")
        tmp.write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, p)

    def create(self, subject: str, description: str = "") -> str:
        task = {
            "id": self._next_id(),
            "subject": subject,
            "description": description,
            "status": "pending",
            "owner": None,
            "blockedBy": []
        }
        self._save(task)
        return json.dumps(task, indent=2)

    def get(self, tid: int) -> str:
        return json.dumps(self._load(tid), indent=2)

    def update(self, tid: int, status: str = None,
               add_blocked_by: list = None, remove_blocked_by: list = None) -> str:
        task = self._load(tid)
        if status:
            task["status"] = status
            if status == "completed":
                for f in self._tasks_dir.glob("task_*.json"):
                    t = json.loads(f.read_text(encoding="utf-8"))
                    if tid in t.get("blockedBy", []):
                        t["blockedBy"].remove(tid)
                        self._save(t)
            if status == "deleted":
                (self._tasks_dir / f"task_{tid}.json").unlink(missing_ok=True)
                return f"Task {tid} deleted"
        if add_blocked_by:
            task["blockedBy"] = list(set(task["blockedBy"] + add_blocked_by))
        if remove_blocked_by:
            task["blockedBy"] = [x for x in task["blockedBy"] if x not in remove_blocked_by]
        self._save(task)
        return json.dumps(task, indent=2)

    def list_all(self) -> str:
        tasks = [json.loads(f.read_text(encoding="utf-8")) for f in sorted(self._tasks_dir.glob("task_*.json"))]
        if not tasks:
            return "No tasks."
        lines = []
        for t in tasks:
            m = {"pending": "[ ]", "in_progress": "[>]", "completed": "[x]"}.get(t["status"], "[?]")
            owner = f" @{t['owner']}" if t.get("owner") else ""
            blocked = f" (blocked by: {t['blockedBy']})" if t.get("blockedBy") else ""
            lines.append(f"{m} #{t['id']}: {t['subject']}{owner}{blocked}")
        return "\n".join(lines)

    def claim(self, tid: int, owner: str) -> str:
        task = self._load(tid)
        task["owner"] = owner
        task["status"] = "in_progress"
        self._save(task)
        return f"Claimed task #{tid} for {owner}"


_TASK_MGR: TaskManager = None


def get_task_mgr() -> TaskManager:
    global _TASK_MGR
    if _TASK_MGR is None:
        _TASK_MGR = TaskManager()
    return _TASK_MGR


# ==================== task 工具的 handler ====================

_MANAGER_MODEL = os.environ.get("MODEL_ID", "claude-sonnet-4-20250514")


def get_manager_model() -> str:
    return _MANAGER_MODEL


def _task_handler(**kw) -> str:
    """
    task 工具：同步派发子 agent（类似 s_full.py 的 run_subagent）

    根据 agent_type 决定子 agent 的工具：
    - "Explore"：bash, read_file（只读）
    - "general-purpose"：bash, read_file, write_file, edit_file（可读写，有危险检测）

    由主 agent 调用，主 agent 决定派什么类型的子 agent。
    """
    from tool._tools_impl import EXPLORE_SUB_TOOLS, EXPLORE_SUB_HANDLERS, GP_SUB_TOOLS, GP_SUB_HANDLERS

    prompt = kw.get("prompt", "")
    agent_type = kw.get("agent_type", "Explore")

    if agent_type == "Explore":
        sub_tools = EXPLORE_SUB_TOOLS
        sub_handlers = EXPLORE_SUB_HANDLERS
        system = (
            "You are a research assistant. Use tools to explore the codebase and gather information.\n"
            "Be thorough. Return a clear summary of findings. Do not modify files.\n"
            "Use summarize when context gets too long."
        )
    else:
        sub_tools = GP_SUB_TOOLS
        sub_handlers = GP_SUB_HANDLERS
        system = (
            "You are a coding assistant. Use tools to read, write, and edit files to complete tasks.\n"
            "Follow good practices: validate inputs, handle errors, keep changes focused.\n"
            "Dangerous commands (rm -rf, curl | sh, etc.) require explicit confirmation — do not run them silently.\n"
            "Use summarize when context gets too long. Return clear, actionable output."
        )

    from main.llm_adapter import create_llm_client
    llm = create_llm_client()
    model = kw.get("model") or get_manager_model()
    llm_timeout = int(os.environ.get("LLM_TIMEOUT", "120"))

    sub_msgs = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    resp = None
    all_tool_results = []

    for _ in range(10):
        resp = llm.create(
            model=model,
            messages=sub_msgs,
            tools=sub_tools,
            max_tokens=8000,
            timeout=llm_timeout,
        )
        sub_msgs.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason != "tool_use":
            break
        round_results = []
        for b in (resp.tool_uses or []):
            h = sub_handlers.get(b.name, lambda **k: "Unknown tool")
            result_content = str(h(**b.input))[:50000]
            round_results.append({"type": "tool_result", "tool_use_id": b.id, "content": result_content})
            all_tool_results.append(f"[{b.name}] {result_content[:200]}")
        sub_msgs.append({"role": "user", "content": round_results})

    if resp:
        text = resp.content if resp.content else ""
        tool_summary = "\n".join(all_tool_results) if all_tool_results else "(no tools used)"
        if text and all_tool_results:
            return f"[task result]\n{text}\n\n[tools used: {len(all_tool_results)}]\n{tool_summary}"
        elif all_tool_results:
            return f"[task result — tools used: {len(all_tool_results)}]\n{tool_summary}"
        else:
            return text or "(no output)"
    return "(subagent failed)"
