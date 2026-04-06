"""
file_tools.py - 文件操作工具

bash / powershell / read_file / write_file / edit_file
以及危险命令检测和默认权限回调。
"""
from pathlib import Path
import locale


# ==================== 危险命令检测 ====================

DANGEROUS_PATTERNS = [
    "rm -rf",
    "sudo",
    "shutdown",
    "reboot",
    "> /dev/",
    "mkfs",
    "dd if=",
    "curl | sh",
    "wget | sh",
]

# 禁止写入的系统路径模式
PROTECTED_PATH_PATTERNS = [
    "/etc/",
    "/usr/",
    "/bin/",
    "/sbin/",
    "/boot/",
    "/sys/",
    "/proc/",
    "/dev/",
    "C:\\Windows\\",
    "C:\\Program Files",
    "C:\\Program Files (x86)",
    "C:\\System32",
]


def is_dangerous(command: str) -> bool:
    """检查命令是否包含危险模式"""
    return any(p in command for p in DANGEROUS_PATTERNS)


def is_protected_path(path: str) -> bool:
    """检查路径是否指向系统保护目录（同时检查原始路径和绝对路径）"""
    p = path.replace("\\", "/")
    p_abs = str(Path(path).resolve()).replace("\\", "/")
    candidates = {p, p_abs}
    return any(
        any(cand.startswith(pat.replace("\\", "/")) for cand in candidates)
        for pat in PROTECTED_PATH_PATTERNS
    )


def default_permission_callback(command: str, tool_name: str) -> str:
    """
    默认权限确认回调（交互式）。
    返回值:
        "allow"     → 放行本次
        "deny"      → 拒绝本次
        "allow_all" → 放行本次并记住（本次会话所有危险命令都放行）
    """
    print(f"\n{'='*50}")
    print(f"⚠️  DANGEROUS COMMAND DETECTED")
    print(f"{'='*50}")
    print(f"Tool:    {tool_name}")
    print(f"Command: {command[:200]}")
    print(f"[a] Allow this one")
    print(f"[A] Allow all dangerous (this session)")
    print(f"[d] Deny this one")
    choice = input("> ").strip().lower()
    print()
    return choice


def _default_bash(command: str) -> str:
    import subprocess
    try:
        r = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
            encoding=locale.getpreferredencoding(False),
            errors="replace",
        )
        out = ((r.stdout or "") + (r.stderr or "")).strip()
        return out[:50000] if out else "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: Timeout (120s)"
    except Exception as e:
        return f"Error: {e}"


def _default_powershell(command: str) -> str:
    import subprocess
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            capture_output=True, text=True, timeout=120,
            encoding=locale.getpreferredencoding(False), errors="replace"
        )
        out = ((r.stdout or "") + (r.stderr or "")).strip()
        return out[:50000] if out else "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: Timeout (120s)"
    except Exception as e:
        return f"Error: {e}"


def _default_read(path: str) -> str:
    try:
        return Path(path).read_text()[:50000]
    except Exception as e:
        return f"Error: {e}"


def _default_write(path: str, content: str) -> str:
    if is_protected_path(path):
        return f"[BLOCKED] Protected path: {path}"
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content)
        return f"Wrote {len(content)} bytes to {path}"
    except Exception as e:
        return f"Error: {e}"


def _default_edit(path: str, old_text: str, new_text: str) -> str:
    if is_protected_path(path):
        return f"[BLOCKED] Protected path: {path}"
    try:
        p = Path(path)
        c = p.read_text()
        if old_text not in c:
            return f"Error: Text not found in {path}"
        p.write_text(c.replace(old_text, new_text, 1))
        return f"Edited {path}"
    except Exception as e:
        return f"Error: {e}"


# ==================== glob 工具 ====================

def _glob_handler(**kw) -> str:
    pattern = kw.get("pattern", "")
    base = kw.get("base", ".")
    try:
        from pathlib import Path
        base_path = Path(base)
        paths = sorted(str(p) for p in base_path.glob(pattern))
        if not paths:
            return f"No matches for {pattern} in {base}"
        return "\n".join(paths)
    except Exception as e:
        return f"Glob error: {e}"


# ==================== DEFAULT_TOOLS 和 DEFAULT_HANDLERS ====================

DEFAULT_TOOLS = [
    {"name": "bash", "description": "Run a bash command.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "powershell", "description": "Run a PowerShell command.",
     "input_schema": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}},
    {"name": "read_file", "description": "Read file contents.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}},
    {"name": "write_file", "description": "Write content to a file.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}},
    {"name": "edit_file", "description": "Replace exact text in a file.",
     "input_schema": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}}, "required": ["path", "old_text", "new_text"]}},
    {"name": "glob", "description": "Find files matching a glob pattern.",
     "input_schema": {"type": "object", "properties": {"pattern": {"type": "string", "description": "Glob pattern (e.g. **/*.py)"}, "base": {"type": "string", "description": "Base directory", "default": "."}}, "required": ["pattern"]}},
]

DEFAULT_HANDLERS = {
    "bash": lambda **kw: _default_bash(kw["command"]),
    "powershell": lambda **kw: _default_powershell(kw["command"]),
    "read_file": lambda **kw: _default_read(kw["path"]),
    "write_file": lambda **kw: _default_write(kw["path"], kw["content"]),
    "edit_file": lambda **kw: _default_edit(kw["path"], kw["old_text"], kw["new_text"]),
    "glob": _glob_handler,
}
