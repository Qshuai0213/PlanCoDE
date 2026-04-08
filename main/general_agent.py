"""
general_agent.py - GeneralAgent
"""
import os
from pathlib import Path

from agent.agent_loop import EventCallback, EventCollector, RunResult, agent_loop
from agent.context import AgentContext
from main.llm_adapter import create_llm_client
from tool import ALL_HANDLERS, ALL_TOOLS, SkillLoader
from tool.skills import set_skills_dir


_BASE_SYSTEM = """你是 PlanCoDE 的通用 Agent 助手。用户让你做什么，你就去做什么。动手前先思考，再选择合适的工具。遇到复杂任务时，主动拆解并逐步推进。

工作方式：
- 交互式：用户说一条，你执行一条，直到任务完成
- 需求不清时先探索，不盲目动手
- 出错后先看清问题，再决定下一步，不要死循环

工具使用规则：
- 每次调用前先说明要做什么、为什么要做
- 每次调用后简要汇报结果
- 上下文过长时主动 summarize
- 如果当前环境是 Windows，执行系统命令时优先使用 powershell，不要默认使用 Linux/bash 路径

完成代码修改后要尽量做验证，不要只看文件是否写成功。"""


def _resolve_project_root() -> Path:
    current = Path(__file__).resolve().parent
    candidates = [current, *current.parents]
    for candidate in candidates:
        if (candidate / "main").exists() and (candidate / "tool").exists() and (candidate / "agent").exists():
            return candidate
    return current.parent


class GeneralAgent:
    """
    General-purpose agent for free-form conversations and maintenance tasks.
    """

    def __init__(
        self,
        workdir: Path = None,
        model: str = None,
        system: str = None,
        skills_dir: Path = None,
        context: AgentContext = None,
    ):
        self.workdir = Path(workdir) if workdir else Path.cwd()
        self.project_root = _resolve_project_root()
        self.model = model or os.environ.get("MODEL_ID", "none")
        self.llm = create_llm_client()
        self.context = context or AgentContext(workdir=self.workdir)

        sk_dir = skills_dir or (self.workdir / "skills")
        self.skills = SkillLoader(sk_dir, workdir=self.workdir)
        set_skills_dir(sk_dir, workdir=self.workdir)

        if system:
            self.system = system
        else:
            runtime_context = (
                f"\n\nRuntime context:\n"
                f"- PlanCoDE project root: {self.project_root}\n"
                f"- Your default General workspace: {self.workdir}\n"
                f"- Unless the user explicitly specifies another path, treat {self.workdir} as your default working directory.\n"
                f"- If you need files from the PlanCoDE project itself, they are under {self.project_root}."
            )
            skill_line = f"\n\nAvailable skills:\n{self.skills.descriptions()}" if self.skills.skills else ""
            self.system = _BASE_SYSTEM + runtime_context + skill_line

    def run(self, prompt: str = None, messages: list = None, event_callback: EventCallback = None) -> RunResult:
        collector = event_callback or EventCollector()

        config = {
            "system": self.system,
            "model": self.model,
            "tools": ALL_TOOLS,
            "handlers": ALL_HANDLERS,
            "max_tokens": 8000,
            "llm_timeout": 120,
            "token_threshold": 100_000,
        }

        if messages:
            normalized_messages = messages
        elif prompt:
            normalized_messages = [{"role": "user", "content": prompt}]
        else:
            normalized_messages = [{"role": "user", "content": "你好，我在这里，等你发出任务。"}]

        return agent_loop(
            messages=normalized_messages,
            llm_adapter=self.llm,
            config=config,
            ctx=self.context,
            event_callback=collector,
        )

    def run_repl(self, event_callback: EventCallback = None):
        collector = event_callback or EventCollector()
        messages = []

        config = {
            "system": self.system,
            "model": self.model,
            "tools": ALL_TOOLS,
            "handlers": ALL_HANDLERS,
            "max_tokens": 8000,
            "llm_timeout": 120,
            "token_threshold": 100_000,
        }

        print(f"[GeneralAgent] 工作目录: {self.workdir}")
        print(f"[GeneralAgent] 项目根目录: {self.project_root}")
        print(f"[GeneralAgent] 模型: {self.model}")
        print("[GeneralAgent] 输入 q 或 exit 退出")
        print()

        while True:
            try:
                user_input = input("\033[36m> \033[0m")
            except (EOFError, KeyboardInterrupt):
                print("\n[exit]")
                break

            if user_input.strip().lower() in ("q", "exit", "quit"):
                print("[exit]")
                break

            if not user_input.strip():
                continue

            messages.append({"role": "user", "content": user_input})

            result = agent_loop(
                messages=messages,
                llm_adapter=self.llm,
                config=config,
                ctx=self.context,
                event_callback=collector,
            )

            if hasattr(result, "content") and result.content:
                print(f"\n{result.content}\n")
            elif hasattr(result, "final_content") and result.final_content:
                print(f"\n{result.final_content}\n")

        return collector
