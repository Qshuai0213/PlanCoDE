"""
manager.py - MANAGER_TOOLS 和 MANAGER_HANDLERS 定义

从 skills / todo / task / team 模块收集所有工具和 handler。
"""
from .skills import get_skills
from .todo import get_todo, get_bg
from .bus import get_bus
from .task import get_task_mgr, _task_handler
from .team import get_team


# ==================== Manager Tools 定义 ====================

MANAGER_TOOLS = [
    {"name":"TodoWrite","description":"Update task tracking list. At most 1 item can be in_progress at a time.","input_schema":{"type":"object","properties":{"items":{"type":"array","items":{"type":"object","properties":{"content":{"type":"string"},"status":{"type":"string","enum":["pending","in_progress","completed"]},"activeForm":{"type":"string"}},"required":["content","status","activeForm"]}},"required":["items"]}}},
    {"name": "task", "description": "Run a bounded subagent for isolated, one-shot work. Use when: work is self-contained and result is needed before continuing. Do NOT use for long-running or parallel work — use spawn_teammate instead.",
     "input_schema": {"type": "object", "properties": {"prompt": {"type": "string"}, "agent_type": {"type": "string", "enum": ["Explore", "general-purpose"]}, "model": {"type": "string"}}, "required": ["prompt"]}},
    {"name": "load_skill", "description": "Load specialized knowledge by name. Only use exact names from the 'Available skills' list already provided in context. Do not search the filesystem for skills via shell commands.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]}},
    {"name": "list_skills", "description": "List currently available skills in the active skills directory.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "background_run", "description": "Run command in background thread.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}, "timeout": {"type": "integer"}}, "required": ["command"]}},
    {"name": "check_background", "description": "Check background task status.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "string"}}}},
    {"name": "task_create", "description": "Create a persistent file task.",
     "input_schema": {"type": "object", "properties": {"subject": {"type": "string"}, "description": {"type": "string"}}, "required": ["subject"]}},
    {"name": "task_get", "description": "Get task details by ID.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "integer"}}, "required": ["task_id"]}},
    {"name": "task_update", "description": "Update task status or dependencies.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "integer"}, "status": {"type": "string", "enum": ["pending", "in_progress", "completed", "deleted"]}, "add_blocked_by": {"type": "array", "items": {"type": "integer"}}, "remove_blocked_by": {"type": "array", "items": {"type": "integer"}}}, "required": ["task_id"]}},
    {"name": "task_list", "description": "List all tasks.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "spawn_teammate", "description": "Spawn a persistent teammate for long-running parallel work. Use when: multiple agents must work simultaneously over extended time. Communicate via send_message; results flow back through inbox. Do NOT use for quick one-shot tasks — use task() instead.",
     "input_schema": {"type": "object", "properties": {"name": {"type": "string"}, "role": {"type": "string"}, "prompt": {"type": "string"}}, "required": ["name", "role", "prompt"]}},
    {"name": "list_teammates", "description": "List all teammates.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "send_message", "description": "Send a message to a teammate.",
     "input_schema": {"type": "object", "properties": {"to": {"type": "string"}, "content": {"type": "string"}, "msg_type": {"type": "string"}}, "required": ["to", "content"]}},
    {"name": "read_inbox", "description": "Read and drain the lead's inbox.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "broadcast", "description": "Send message to all teammates.",
     "input_schema": {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"]}},
    {"name": "shutdown_request", "description": "Request a teammate to shut down.",
     "input_schema": {"type": "object", "properties": {"teammate": {"type": "string"}}, "required": ["teammate"]}},
]


# ==================== Manager Tool Handlers ====================

def _TodoWrite_handler(**kw) -> str:
    return get_todo().update(kw["items"])


def _load_skill_handler(**kw) -> str:
    return get_skills().load(kw["name"])


def _list_skills_handler(**kw) -> str:
    skills = get_skills()
    invocable = skills.user_invocable_skills()
    if invocable:
        return "\n".join(f"- {name}: {desc}" for name, desc in invocable.items())
    if skills.skills:
        return "\n".join(
            f"- {name}: {skill['meta'].get('description', '-')}"
            for name, skill in skills.skills.items()
        )
    return "(no skills)"


def _background_run_handler(**kw) -> str:
    return get_bg().run(kw["command"], kw.get("timeout", 120))


def _check_background_handler(**kw) -> str:
    return get_bg().check(kw.get("task_id"))


def _task_create_handler(**kw) -> str:
    return get_task_mgr().create(kw["subject"], kw.get("description", ""))


def _task_get_handler(**kw) -> str:
    return get_task_mgr().get(kw["task_id"])


def _task_update_handler(**kw) -> str:
    return get_task_mgr().update(
        kw["task_id"], kw.get("status"), kw.get("add_blocked_by"), kw.get("remove_blocked_by"))


def _task_list_handler(**kw) -> str:
    return get_task_mgr().list_all()


# team handlers
from .team import _spawn_teammate_handler, _list_teammates_handler, _shutdown_request_handler


def _send_message_handler(**kw) -> str:
    return get_bus().send("lead", kw["to"], kw["content"], kw.get("msg_type", "message"))


def _read_inbox_handler(**kw) -> str:
    import json
    return json.dumps(get_bus().read_inbox("lead"), indent=2)


def _broadcast_handler(**kw) -> str:
    return get_bus().broadcast("lead", kw["content"], get_team().member_names())


MANAGER_HANDLERS = {
    "TodoWrite": _TodoWrite_handler,
    "load_skill": _load_skill_handler,
    "list_skills": _list_skills_handler,
    "background_run": _background_run_handler,
    "check_background": _check_background_handler,
    "task_create": _task_create_handler,
    "task_get": _task_get_handler,
    "task_update": _task_update_handler,
    "task_list": _task_list_handler,
    "spawn_teammate": _spawn_teammate_handler,
    "list_teammates": _list_teammates_handler,
    "send_message": _send_message_handler,
    "read_inbox": _read_inbox_handler,
    "broadcast": _broadcast_handler,
    "shutdown_request": _shutdown_request_handler,
    "task": _task_handler,
}
