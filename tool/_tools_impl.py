"""
_tools_impl.py - 工具实现：schema + handler + computed exports

内部模块，tool 包完全加载后才被导入，不参与 tool/__init__.py 的早期导入链。
"""
from pathlib import Path
import urllib.request

from tool.file_tools import (
    DEFAULT_TOOLS as _FILE_TOOLS,
    DEFAULT_HANDLERS as _file_handlers,
    is_dangerous,
    is_protected_path,
    default_permission_callback,
    _default_bash,
    _default_powershell,
    _default_read,
    _default_write,
    _default_edit,
)
from tool.manager import MANAGER_TOOLS, MANAGER_HANDLERS

# ==================== glob ====================

def _glob_handler(**kw) -> str:
    pattern = kw.get("pattern", "")
    base = kw.get("base", ".")
    try:
        paths = sorted(str(p) for p in Path(base).glob(pattern))
        return "\n".join(paths) if paths else f"No matches for {pattern} in {base}"
    except Exception as e:
        return f"Glob error: {e}"


GLOB_TOOL = {
    "name": "glob",
    "description": "Find files matching a glob pattern.",
    "input_schema": {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "Glob pattern (e.g. **/*.py)"},
            "base": {"type": "string", "description": "Base directory", "default": "."},
        },
        "required": ["pattern"],
    },
}

# ==================== web_fetch ====================

def _web_fetch_handler(**kw) -> str:
    url = kw.get("url")
    prompt = kw.get("prompt", "")
    if not url:
        return "Error: url is required"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode("utf-8", errors="replace")
        if prompt:
            return f"[URL: {url}]\n{content[:50000]}\n\n---\nPrompt: {prompt}"
        return f"[URL: {url}]\n{content[:50000]}"
    except Exception as e:
        return f"Fetch error: {e}"


WEB_FETCH_TOOL = {
    "name": "web_fetch",
    "description": "Fetch a URL and return its content.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "prompt": {"type": "string", "description": "Optional instruction for what to extract"},
        },
        "required": ["url"],
    },
}

# ==================== summarize ====================

class _SummarizeHandler:
    """
    summarize 工具的 handler，支持多实例并发。
    每个 agent 创建自己的实例，上下文独立，互不干扰。
    """
    def __init__(self):
        self._ctx = [None, None, None, None]  # [messages, workdir, llm_adapter, model]

    def init(self, messages, workdir, llm_adapter, model):
        self._ctx[0], self._ctx[1], self._ctx[2], self._ctx[3] = messages, workdir, llm_adapter, model

    def __call__(self) -> str:
        messages, workdir, llm_adapter, model = self._ctx
        if messages is None:
            return "Error: summarize not initialized"
        from tool.compression import auto_compact
        compacted = auto_compact(messages, workdir=workdir, llm_adapter=llm_adapter, model=model)
        summary_content = compacted[0].get("content", "") if compacted else "(no output)"
        return f"[Summarized. {len(messages)} messages -> 1]\n{summary_content}"


_summarize_handler = _SummarizeHandler()


SUMMARIZE_TOOL = {
    "name": "summarize",
    "description": "Summarize recent conversation and trim old context. Use when you have enough information to make decisions and old details are no longer needed.",
    "input_schema": {"type": "object", "properties": {}},
}

# ==================== teammate extra tools ====================

TEAMMATE_EXTRA_TOOLS = [
    {"name": "idle", "description": "Signal no more work. Enter idle phase.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "claim_task", "description": "Claim a task from the board.",
     "input_schema": {"type": "object", "properties": {"task_id": {"type": "integer"}}, "required": ["task_id"]}},
]

# ==================== safe wrappers ====================

def _safe_bash(**k):
    cmd = k["command"]
    if is_dangerous(cmd):
        choice = default_permission_callback(cmd, "bash")
        if choice == "deny":
            return f"[BLOCKED] Dangerous command denied: {cmd[:100]}..."
        if choice == "allow_all":
            return "[ALLOWED] All dangerous commands allowed"
    return _default_bash(cmd)


def _safe_write(**k):
    if is_protected_path(k["path"]):
        return f"[BLOCKED] Protected path: {k['path']}"
    return _default_write(k["path"], k["content"])


def _safe_edit(**k):
    if is_protected_path(k["path"]):
        return f"[BLOCKED] Protected path: {k['path']}"
    return _default_edit(k["path"], k["old_text"], k["new_text"])


# ==================== sub-agent tool sets ====================

# Explore: 纯读工具 + web_fetch + summarize（不可写）
EXPLORE_SUB_TOOLS = [
    {"name": "bash", "description": "Run a bash command.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "read_file", "description": "Read file contents.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    GLOB_TOOL,
    WEB_FETCH_TOOL,
    SUMMARIZE_TOOL,
]

# GP: 完整文件工具 + web_fetch + summarize（有危险命令检测）
GP_SUB_TOOLS = _FILE_TOOLS + [WEB_FETCH_TOOL, SUMMARIZE_TOOL]

# Team: FILE_TOOLS + idle + claim_task + web_fetch + summarize
TEAM_SUB_TOOLS = _FILE_TOOLS + TEAMMATE_EXTRA_TOOLS + [WEB_FETCH_TOOL, SUMMARIZE_TOOL]

# ==================== handlers ====================

FILE_HANDLERS = {
    **_file_handlers,
    "glob": _glob_handler,
    "web_fetch": _web_fetch_handler,
}

EXPLORE_SUB_HANDLERS = {
    "bash": lambda **k: _default_bash(k["command"]),
    "read_file": lambda **k: _default_read(k["path"]),
    "glob": _glob_handler,
    "web_fetch": _web_fetch_handler,
    "summarize": _summarize_handler,
}

GP_SUB_HANDLERS = {
    "bash": _safe_bash,
    "powershell": lambda **k: _default_powershell(k["command"]),
    "read_file": lambda **k: _default_read(k["path"]),
    "write_file": _safe_write,
    "edit_file": _safe_edit,
    "glob": _glob_handler,
    "web_fetch": _web_fetch_handler,
    "summarize": _summarize_handler,
}

TEAM_SUB_HANDLERS = {
    **GP_SUB_HANDLERS,
    "idle": lambda **k: "Entering idle phase.",
    "claim_task": lambda **k: (
        __import__("tool.task", fromlist=["get_task_mgr"]).get_task_mgr().claim(k["task_id"], "teammate")
    ),
}

# ==================== ALL_TOOLS / ALL_HANDLERS ====================

ALL_TOOLS = _FILE_TOOLS + MANAGER_TOOLS + [WEB_FETCH_TOOL, SUMMARIZE_TOOL]
ALL_HANDLERS = {**FILE_HANDLERS, **MANAGER_HANDLERS, "summarize": _summarize_handler}

# 导出给 tool/__init__.py
FILE_TOOLS = _FILE_TOOLS
