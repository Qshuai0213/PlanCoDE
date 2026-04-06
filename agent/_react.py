"""
_react.py - ReAct 执行逻辑公共函数

agent_loop 和 teammate_loop 共用相同的工具执行逻辑。
"""


def execute_tools(
    tool_uses,
    handlers: dict,
    permission_callback,
    allow_all_dangerous_ref: list,
    summarize_handler=None,
    tool_name_prefix: str = "",
) -> tuple:
    """
    执行一组 tool_use 块。

    参数:
        tool_uses:            response.tool_uses 列表
        handlers:             工具名 → handler 映射
        permission_callback:  危险命令确认回调 (command, tool_name) -> str
        allow_all_dangerous_ref: [bool] 单元素列表，允许 in-place 修改
        summarize_handler:    summarize 工具的 handler（调用 in-place 修改 messages）
        tool_name_prefix:    日志前缀（如 "[agent]" 或 "[teammate-xxx]"）

    返回:
        (results, skip_results_append)
        - results: tool_result 字典列表
        - skip_results_append: summarize 是否已 in-place 修改了 messages
    """
    results = []
    skip_results_append = False

    for block in tool_uses:
        tool_name = block.name
        handler = handlers.get(tool_name)

        # === 危险命令检查 ===
        command = block.input.get("command") if tool_name in ("bash", "powershell") else None
        blocked = False

        if command:
            from tool import is_dangerous
            if is_dangerous(command) and not allow_all_dangerous_ref[0]:
                choice = permission_callback(command, tool_name)
                if choice == "deny":
                    output = f"[BLOCKED] Dangerous command denied: {command[:100]}..."
                    blocked = True
                elif choice == "allow_all":
                    output = f"[ALLOWED] Dangerous command allowed: {command[:100]}..."
                    allow_all_dangerous_ref[0] = True

        # === 执行工具 ===
        if not blocked:
            try:
                if tool_name == "summarize" and summarize_handler:
                    # summarize: handler 通过闭包 in-place 修改 messages
                    output = summarize_handler()
                    skip_results_append = True
                elif handler:
                    output = handler(**block.input)
                else:
                    output = f"Unknown tool: {tool_name}"
            except Exception as e:
                output = f"Error: {e}"

        print(f"{tool_name_prefix}{tool_name}: {str(output)[:120]}")
        results.append({
            "type": "tool_result",
            "tool_use_id": block.id,
            "content": str(output),
        })

    return results, skip_results_append
