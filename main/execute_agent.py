"""
execute_agent.py - 执行 Agent（ExecuteAgent）

只关心执行，不关心规划和设计：
- 读取 plan.md 和 design.md
- 按任务顺序执行（task_create、TodoWrite 追踪进度）
- 写代码、跑命令、测试
- 遇到问题记录，不擅自改 design，最终生成一份执行报告在规定路径下

使用 agent_loop 作为运行引擎。
"""
import os
from pathlib import Path

from agent.agent_loop import agent_loop, EventCollector, EventCallback, RunResult
from agent.context import AgentContext
from main.llm_adapter import create_llm_client
from tool import (
    TodoManager,
    BackgroundManager,
    TaskManager,
    MessageBus,
    TeammateManager,
    ALL_TOOLS,
    ALL_HANDLERS,
    SkillLoader,
)
from tool.skills import set_skills_dir


_BASE_SYSTEM = """你是 Execute。你唯一的工作：根据 plan.md 和 design.md 执行实现。

你不规划、不设计。你只执行。

工作流：
1. 读取 plan.md 和 design.md，理解目标和设计
2. 按设计中任务顺序逐一执行
3. 每完成一个任务：跑测试/验证 → 确认通过 → 标记 TodoWrite 完成
4. 遇到 design 未覆盖的情况：小偏差自行决定，大偏离记录到问题清单
5. 所有任务完成后：清理调试代码，生成 report.md（完成项、遗留问题、建议）

规则：
- 严格按 design 实现，不擅自改架构方向
- 调用任何工具前先说明原因和期望结果
- 写完后跑一遍验证，确认没有 error 再标记完成
- 不留下调试代码，保持代码整洁
- 遇到问题先尝试解决，解决不了再记录
"""


class ExecuteAgent:
    """
    执行 Agent — agent_loop 的具体使用者

    参数:
        workdir:       工作目录（默认为当前目录）
        model:         模型名（默认从 MODEL_ID 环境变量）
        system:        系统提示词（默认基础 prompt + skill 描述）
        skills_dir:    skill 文件目录（默认 workdir/skills）
        context:       AgentContext 实例（不传则自动创建）
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
        self.model = model or os.environ.get("MODEL_ID", "claude-sonnet-4-20250514")
        self.llm = create_llm_client()
        self.context = context or AgentContext(workdir=self.workdir)

        sk_dir = skills_dir or (self.workdir / "skills")
        self.skills = SkillLoader(sk_dir) if sk_dir.exists() else None
        set_skills_dir(sk_dir if sk_dir.exists() else None)

        if system:
            self.system = system
        else:
            skill_line = f"\n\nAvailable skills:\n{self.skills.descriptions()}" if self.skills else ""
            self.system = _BASE_SYSTEM + skill_line

    def run(
        self,
        plan_path: Path = None,
        design_path: Path = None,
        event_callback: EventCallback = None,
    ) -> RunResult:
        """
        启动执行会话。

        参数:
            plan_path:     plan.md 路径（默认 workdir/plan.md）
            design_path:   design.md 路径（默认 workdir/design.md）
            event_callback: EventCallback 实例（可选）
        返回:
            RunResult
        """
        collector = event_callback or EventCollector()

        plan_path = plan_path or (self.workdir / "plan.md")
        design_path = design_path or (self.workdir / "design.md")

        config = {
            "system": self.system,
            "model": self.model,
            "tools": ALL_TOOLS,
            "handlers": ALL_HANDLERS,
            "max_tokens": 8000,
            "llm_timeout": 120,
            "token_threshold": 100_000,
        }

        # 读取 plan 和 design 内容
        plan_content = None
        design_content = None

        p = Path(plan_path)
        if p.exists():
            plan_content = p.read_text(encoding="utf-8")

        d = Path(design_path)
        if d.exists():
            design_content = d.read_text(encoding="utf-8")

        init_msg_parts = [f"[Working directory: {self.workdir}]"]

        if plan_content:
            init_msg_parts.append(f"[plan.md]:\n{plan_content}")
        if design_content:
            init_msg_parts.append(f"[design.md]:\n{design_content}")

        init_msg_parts.append(
            "[Read both files above, then begin executing tasks in order. Use TodoWrite to track progress.]"
        )

        messages = [{"role": "user", "content": "\n\n".join(init_msg_parts)}]
        return agent_loop(
            messages=messages,
            llm_adapter=self.llm,
            config=config,
            ctx=self.context,
            event_callback=collector,
        )
