"""
design_agent.py - 设计 Agent（DesignAgent）

只关心设计，不关心实现和规划：
- 理解需求，产出架构设计
- 设计文件布局、模块结构、数据模型、API
- 写设计文档（design.md）
- 必要时探索代码库（read_file、bash）
- 不做任务分解，不派发工作

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


# 基础 system prompt
_BASE_SYSTEM = """你是 Designer。你唯一的工作：根据 Planner 的 plan.md，产出架构设计文档 design.md。

你不写代码、不拆任务、不协调。你只做设计，写出具体的实现步骤。

工作流：
1. 读取路径下的 plan.md，理解要构建什么
2. 设计架构：文件布局、模块划分、数据模型、API 接口（如要求）
3. 给出技术选型和理由
4. - 交付 design.md 后可以继续和用户交流，回答关于 design.md 的问题，根据用户需求继续调整 plan.md


design.md 必须包含：
- 项目概述与目标
- 技术栈与选型理由
- 文件/目录结构
- 核心数据模型
- API 设计（如要求）
- 关键模块及职责
- 依赖关系

规则：
- 不实现，不规划，只设计
- 调用任何工具前先说明原因和期望结果
"""


class DesignAgent:
    """
    设计 Agent — agent_loop 的具体使用者

    参数:
        workdir:       工作目录（默认为当前目录，design.md 输出到这里）
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

    def run(self, plan: str = None, plan_path: Path = None, output_path: Path = None, event_callback: EventCallback = None) -> RunResult:
        """
        启动设计会话。

        参数:
            plan:        PlanAgent 产出的 plan 内容（字符串）
            plan_path:  plan.md 文件路径（与 plan 二选一，优先 plan）
            output_path: 最终设计文档输出路径（默认 workdir/design.md）
            event_callback: EventCallback 实例（可选）
        返回:
            RunResult
        """
        collector = event_callback or EventCollector()
        output_path = output_path or (self.workdir / "design.md")

        config = {
            "system": self.system,
            "model": self.model,
            "tools": ALL_TOOLS,
            "handlers": ALL_HANDLERS,
            "max_tokens": 8000,
            "llm_timeout": 120,
            "token_threshold": 100_000,
        }

        # 优先用传入的 plan 内容，否则读文件
        plan_content = plan
        if plan_content is None and plan_path:
            p = Path(plan_path)
            if p.exists():
                plan_content = p.read_text(encoding="utf-8")

        # 构建初始消息：plan 内容 + 指令
        if plan_content:
            init_msg = (
                f"[Working directory: {self.workdir}]\n"
                f"[Plan from Planner:]\n{plan_content}\n\n"
                f"[When finished, write the final design to: {output_path}]"
            )
        else:
            init_msg = (
                f"[Working directory: {self.workdir}]\n"
                f"[No plan provided yet — you may explore to understand the context.]\n"
                f"[When finished, write the final design to: {output_path}]"
            )

        messages = [{"role": "user", "content": init_msg}]
        return agent_loop(
            messages=messages,
            llm_adapter=self.llm,
            config=config,
            ctx=self.context,
            event_callback=collector,
        )
