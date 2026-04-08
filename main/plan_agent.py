"""
plan_agent.py - 规划 Agent（PlanAgent）

不关心实现，不关心设计，只关心规划：
- 分解任务（task_create）
- 管理工作项（TodoWrite）
- 派发探索任务（task agent_type=Explore）
- 派发编码任务（task agent_type=general-purpose）
- 协调 teammates 并行工作（spawn_teammate + send_message）

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


# 基础 system prompt（工具通过 config 注入，不写在 prompt 里）
_BASE_SYSTEM = """你是 Planner — 一个项目规划 Agent。

你唯一的工作：理解用户需求，写出一份规划文档 plan.md。

你不做：
- 写产品代码
- 设计架构或文件结构和实现步骤（那是 Designer 的工作）
- 执行实现

你做：
- 理解用户需求
- 可以调研必要的信息（技术栈、依赖等）
- 写出 plan.md，覆盖：目标、步骤、依赖、验收标准
- 交付 plan.md 后可以继续和用户交流，回答关于 plan.md 的问题，根据用户需求继续调整 plan.md

输出：
- 最终产物是一份 plan.md ，写在 plan_path
- 一份规划文档，涵盖目标、步骤、依赖、验收标准

规则：
- 不实现，不设计，只规划
- 调用任何工具前先说明原因和期望结果
"""


class PlanAgent:
    """
    规划 Agent — agent_loop 的具体使用者

    参数:
        workdir:       工作目录（默认为当前目录，plan.md 输出到这里）
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

        # Skill 加载，拼入 system prompt
        sk_dir = skills_dir or (self.workdir / "skills")
        self.skills = SkillLoader(sk_dir, workdir=self.workdir)
        set_skills_dir(sk_dir, workdir=self.workdir)

        # System prompt = 基础 + skill 描述（工具通过 config 注入，不写在这里）
        if system:
            self.system = system
        else:
            skill_line = f"\n\nAvailable skills:\n{self.skills.descriptions()}" if self.skills.skills else ""
            self.system = _BASE_SYSTEM + skill_line

    def run(self, goal: str, output_path: Path = None, event_callback: EventCallback = None) -> RunResult:
        """
        启动规划会话。

        参数:
            goal:            用户的需求描述（如 "帮我做一个博客系统"）
            output_path:     最终 plan 输出路径（默认 workdir/plan.md）
            event_callback:  EventCallback 实例（可选）
                           - 不传：自动创建 EventCollector 收集所有事件并返回
                           - 传 PrintEventCallback：打印调试输出
                           - 传自定义 EventCallback：用于可视化 UI
        返回:
            RunResult — 包含:
            - result.content: 最终文本
            - result.events: 所有事件的列表
            - result.tool_calls: 所有工具调用
            - result.summary(): 摘要 dict
        """
        collector = event_callback or EventCollector()

        output_path = output_path or (self.workdir / "plan.md")

        config = {
            "system": self.system,
            "model": self.model,
            "tools": ALL_TOOLS,          # 工具 schema 通过 config 注入
            "handlers": ALL_HANDLERS,    # 工具 handler 也通过 config 注入
            "max_tokens": 8000,
            "llm_timeout": 120,
            "token_threshold": 100_000,
        }
        # 告知 agent 工作目录和 plan 输出位置
        output_hint = (
            f"\n\n[Working directory: {self.workdir}]\n"
            f"[When finished, write the final plan to: {output_path}]"
        )
        messages = [
            {"role": "user", "content": goal + output_hint},
        ]
        return agent_loop(
            messages=messages,
            llm_adapter=self.llm,
            config=config,
            ctx=self.context,
            event_callback=collector,
        )

    def run_streaming(self, prompt: str):
        """
        流式版本（暂未实现，保留接口）。
        未来可基于 agent_loop 的事件回调实现。
        """
        raise NotImplementedError("Streaming not yet implemented — use run() for now")
