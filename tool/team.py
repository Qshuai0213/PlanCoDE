"""
team.py - TeammateManager 和团队相关 handler
"""
import json
import os
import threading
import uuid
from pathlib import Path

from .bus import MessageBus, get_bus
from .task import TaskManager, get_task_mgr


class TeammateManager:
    """Teammate 管理器"""

    def __init__(self, bus: MessageBus, task_mgr: TaskManager, team_dir: Path = None, tasks_dir: Path = None):
        self._team_dir = team_dir or (Path.cwd() / ".team")
        self._tasks_dir = tasks_dir or (self._team_dir / "tasks")
        self._team_dir.mkdir(exist_ok=True)
        self.bus = bus
        self.task_mgr = task_mgr
        self._config_path = self._team_dir / "config.json"
        self._config = self._load()
        self.threads = {}  # {name: threading.Thread}
        self._lock = threading.Lock()

    def _load(self) -> dict:
        if self._config_path.exists():
            return json.loads(self._config_path.read_text(encoding="utf-8"))
        return {"team_name": "default", "members": []}

    def _save(self):
        tmp = self._config_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._config, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self._config_path)

    def _find(self, name: str) -> dict:
        for m in self._config["members"]:
            if m["name"] == name:
                return m
        return None

    def set_status(self, name: str, status: str):
        member = self._find(name)
        if member:
            member["status"] = status
            self._save()

    def spawn(self, name: str, role: str, prompt: str) -> str:
        with self._lock:
            member = self._find(name)
            if member:
                if member["status"] not in ("idle", "shutdown"):
                    return f"Error: '{name}' is currently {member['status']}"
                member["status"] = "working"
                member["role"] = role
            else:
                member = {"name": name, "role": role, "status": "working"}
                self._config["members"].append(member)
            self._save()

            from agent.teammate_loop import teammate_loop
            from main.llm_adapter import create_llm_client
            from tool._tools_impl import TEAM_SUB_HANDLERS, TEAMMATE_EXTRA_TOOLS, WEB_FETCH_TOOL
            from .task import get_manager_model

            llm = create_llm_client()
            team_name = self._config.get("team_name", "default")
            # NOTE: teammate_loop prepends FILE_TOOLS, so only pass extras here
            sub_config = {
                "system": f"You are '{name}', role: {role}, team: {team_name}. Use idle when done. You may auto-claim tasks.",
                "tools": TEAMMATE_EXTRA_TOOLS + [WEB_FETCH_TOOL],
                "handlers": TEAM_SUB_HANDLERS,
                "model": get_manager_model(),
                "max_tokens": 8000,
            }
            t = threading.Thread(
                target=teammate_loop,
                args=(name, role, prompt, llm, sub_config, self._tasks_dir, None, self),
                daemon=True,
            )
            self.threads[name] = t
            t.start()
        return f"Spawned '{name}' (role: {role})"

    def list_all(self) -> str:
        if not self._config["members"]:
            return "No teammates."
        lines = [f"Team: {self._config['team_name']}"]
        for m in self._config["members"]:
            lines.append(f"  {m['name']} ({m['role']}): {m['status']}")
        return "\n".join(lines)

    def member_names(self) -> list:
        return [m["name"] for m in self._config["members"]]


_TEAM: TeammateManager = None


def get_team() -> TeammateManager:
    global _TEAM
    if _TEAM is None:
        _TEAM = TeammateManager(get_bus(), get_task_mgr())
    return _TEAM


# ==================== 团队相关 handler ====================

def _spawn_teammate_handler(**kw) -> str:
    return get_team().spawn(kw["name"], kw["role"], kw["prompt"])


def _list_teammates_handler(**kw) -> str:
    return get_team().list_all()


def _shutdown_request_handler(**kw) -> str:
    teammate = kw["teammate"]
    req_id = str(uuid.uuid4())[:8]
    return get_bus().send("lead", teammate, "Please shut down.", "shutdown_request", {"request_id": req_id})
