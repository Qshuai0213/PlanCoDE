"""
tool - 工具模块

包含：
- file_tools: 文件操作工具（bash/powershell/read/write/edit/glob）
- skills: 技能加载器
- todo: TodoManager / BackgroundManager
- bus: MessageBus
- task: TaskManager
- team: TeammateManager
- manager: MANAGER_TOOLS / MANAGER_HANDLERS
- compression: 上下文压缩工具
- _tools_impl: 工具 schema + handler + computed exports

使用示例：
    from tool import (
        FILE_TOOLS, FILE_HANDLERS,
        MANAGER_TOOLS, MANAGER_HANDLERS,
        ALL_TOOLS, ALL_HANDLERS,
        TodoManager, BackgroundManager, TaskManager, MessageBus, TeammateManager,
        get_todo, get_bg, get_task_mgr, get_bus, get_team,
        is_dangerous, default_permission_callback,
        microcompact, auto_compact, estimate_tokens,
    )
"""
# === 1. 从子模块导入（tool 包完全加载后，无循环）===
from .file_tools import (
    is_dangerous,
    default_permission_callback,
    DANGEROUS_PATTERNS,
    is_protected_path,
)

from .manager import MANAGER_TOOLS, MANAGER_HANDLERS

from .skills import SkillLoader, get_skills

from .todo import (
    TodoManager,
    BackgroundManager,
    get_todo,
    get_bg,
)

from .bus import (
    MessageBus,
    get_bus,
)

from .task import (
    TaskManager,
    get_task_mgr,
    _task_handler,
    get_manager_model,
)

from .team import (
    TeammateManager,
    get_team,
)

from .compression import (
    microcompact,
    auto_compact,
    estimate_tokens,
)

# === 2. 从内部 _tools_impl 导入 computed values ===
# 此模块在 tool 包完全加载后才被导入，不参与循环依赖
from ._tools_impl import (
    FILE_HANDLERS,
    ALL_TOOLS,
    ALL_HANDLERS,
    FILE_TOOLS,
    EXPLORE_SUB_TOOLS,
    GP_SUB_TOOLS,
    TEAM_SUB_TOOLS,
    EXPLORE_SUB_HANDLERS,
    GP_SUB_HANDLERS,
    TEAM_SUB_HANDLERS,
    TEAMMATE_EXTRA_TOOLS,
    WEB_FETCH_TOOL,
    SUMMARIZE_TOOL,
    GLOB_TOOL,
    _summarize_handler,
)
