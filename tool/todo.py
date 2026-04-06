"""
todo.py - TodoManager 和 BackgroundManager
"""
import json
import os
import subprocess
import threading
import uuid
from pathlib import Path
from queue import Queue


class TodoManager:
    """轻量级 Todo 管理器，支持文件持久化"""

    def __init__(self, todo_file: Path = None):
        self._todo_file = todo_file or (Path.cwd() / ".todos.json")
        self.items: list = self._load()

    def _load(self) -> list:
        if self._todo_file.exists():
            try:
                return json.loads(self._todo_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, IOError):
                return []
        return []

    def _save(self):
        tmp = self._todo_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.items, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self._todo_file)

    def update(self, items: list) -> str:
        validated = []
        ip = 0
        for i, item in enumerate(items):
            content = str(item.get("content", "")).strip()
            status = str(item.get("status", "pending")).lower()
            af = str(item.get("activeForm", "")).strip()
            if not content:
                raise ValueError(f"Item {i}: content required")
            if status not in ("pending", "in_progress", "completed"):
                raise ValueError(f"Item {i}: invalid status '{status}'")
            if not af:
                raise ValueError(f"Item {i}: activeForm required")
            if status == "in_progress":
                ip += 1
            validated.append({"content": content, "status": status, "activeForm": af})
        if len(validated) > 20:
            raise ValueError("Max 20 todos")
        if ip > 1:
            raise ValueError("Only one in_progress allowed")
        self.items = validated
        self._save()
        return self.render()

    def render(self) -> str:
        if not self.items:
            return "No todos."
        lines = []
        for item in self.items:
            m = {"completed": "[x]", "in_progress": "[>]", "pending": "[ ]"}.get(item["status"], "[?]")
            suffix = f" <- {item['activeForm']}" if item["status"] == "in_progress" else ""
            lines.append(f"{m} {item['content']}{suffix}")
        done = sum(1 for t in self.items if t["status"] == "completed")
        lines.append(f"\n({done}/{len(self.items)} completed)")
        return "\n".join(lines)

    def has_open_items(self) -> bool:
        return any(item.get("status") != "completed" for item in self.items)


class BackgroundManager:
    """后台任务管理器"""

    def __init__(self):
        self.tasks: dict = {}
        self.notifications: Queue = Queue()
        self._workdir = Path.cwd()

    def run(self, command: str, timeout: int = 120, workdir: Path = None) -> str:
        tid = str(uuid.uuid4())[:8]
        self.tasks[tid] = {"status": "running", "command": command, "result": None}
        threading.Thread(
            target=self._exec,
            args=(tid, command, timeout, workdir or self._workdir),
            daemon=True
        ).start()
        return f"Background task {tid} started: {command[:80]}"

    def _exec(self, tid: str, command: str, timeout: int, workdir: Path):
        try:
            r = subprocess.run(command, shell=True, cwd=workdir,
                               capture_output=True, text=True, timeout=timeout)
            output = (r.stdout + r.stderr).strip()[:50000]
            status = "completed" if r.returncode == 0 else "failed"
            self.tasks[tid].update({"status": status, "result": output or "(no output)"})
        except subprocess.TimeoutExpired:
            self.tasks[tid].update({"status": "timeout", "result": "Timeout"})
        except Exception as e:
            self.tasks[tid].update({"status": "error", "result": str(e)})
        self.notifications.put({
            "task_id": tid,
            "status": self.tasks[tid]["status"],
            "result": str(self.tasks[tid]["result"])[:500]
        })

    def check(self, task_id: str = None) -> str:
        if task_id:
            t = self.tasks.get(task_id)
            return f"[{t['status']}] {t.get('result') or '(running)'}" if t else f"Unknown: {task_id}"
        return "\n".join(f"{k}: [{v['status']}] {v['command'][:60]}" for k, v in self.tasks.items()) or "No bg tasks."

    def drain(self) -> list:
        notifs = []
        while not self.notifications.empty():
            notifs.append(self.notifications.get_nowait())
        return notifs


_TODO: TodoManager = None
_BG: BackgroundManager = None


def get_todo() -> TodoManager:
    global _TODO
    if _TODO is None:
        _TODO = TodoManager()
    return _TODO


def get_bg() -> BackgroundManager:
    global _BG
    if _BG is None:
        _BG = BackgroundManager()
    return _BG
