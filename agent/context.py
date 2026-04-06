"""
context.py - Agent 执行上下文

将 Manager 实例通过 Context 对象传入，而非全局单例。
每个 agent 实例有独立的上下文，状态互不污染。
"""
from pathlib import Path

from tool import (
    TodoManager,
    BackgroundManager,
    TaskManager,
    MessageBus,
    TeammateManager,
)


class AgentContext:
    """
    Agent 执行上下文

    包含所有 Manager 实例，由调用方创建并传入 agent_loop / teammate_loop。
    """

    def __init__(
        self,
        workdir: Path = None,
        todo: TodoManager = None,
        bg: BackgroundManager = None,
        task_mgr: TaskManager = None,
        bus: MessageBus = None,
        team: TeammateManager = None,
    ):
        self.workdir = workdir or Path.cwd()
        self.todo = todo or TodoManager()
        self.bg = bg or BackgroundManager()
        self.task_mgr = task_mgr or TaskManager(self.workdir / ".tasks")
        self.bus = bus or MessageBus(self.workdir / ".team" / "inbox")
        self.team = team or TeammateManager(self.bus, self.task_mgr, self.workdir / ".team")
