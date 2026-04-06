"""
compression.py - 上下文压缩工具

两种压缩策略：
1. microcompact() - 轻量压缩，清理旧工具结果
2. auto_compact() - 完整压缩，持久化到文件 + LLM 摘要
"""
import json
import time
from pathlib import Path


def estimate_tokens(messages: list) -> int:
    """
    粗略估算 token 数量。

    检测内容中是否包含中文：
    - 有中文：约 2 字符 / token，用 // 2
    - 纯英文：约 4 字符 / token，用 // 4
    - 混合内容：取中间值 // 3
    """
    import re
    text = json.dumps(messages, default=str)
    # CJK 统一汉字范围：\u4e00-\u9fff
    has_cjk = bool(re.search(r'[\u4e00-\u9fff]', text))
    has_other_cjk = bool(re.search(r'[\u3000-\u303f\uff00-\uffef]', text))  # CJK 符号/全角
    if has_cjk or has_other_cjk:
        # 有中文内容，按 2 字符 / token
        return len(text) // 2
    else:
        # 纯英文，按 4 字符 / token
        return len(text) // 4


def microcompact(messages: list):
    """
    轻量压缩：保留最近 3 个工具结果，旧的超过 100 字符的替换为 [cleared]

    目的：减少 token 占用，但保留最近几条完整结果供 LLM 参考
    """
    tool_result_parts = []

    for msg in messages:
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if isinstance(part, dict) and part.get("type") == "tool_result":
                tool_result_parts.append(part)

    # 保留最近 3 个，不动的部分清理
    if len(tool_result_parts) <= 3:
        return

    for part in tool_result_parts[:-3]:
        c = part.get("content", "")
        if isinstance(c, str) and len(c) > 100:
            part["content"] = "[cleared]"


def auto_compact(messages: list, workdir: Path = None, llm_adapter=None, model: str = None, max_summarize_tokens: int = 2000) -> list:
    """
    完整压缩：

    1. 把当前完整上下文持久化到 transcript 文件
    2. 用 LLM 总结核心内容，保留摘要消息

    返回压缩后的新消息列表（只有一条摘要消息）。

    参数:
        messages:               当前消息列表
        workdir:                工作目录，用于存储 transcript
        llm_adapter:           LLM 适配器（用于生成摘要）
        model:                  模型名
        max_summarize_tokens:   摘要最大 token 数
    """
    workdir = workdir or Path.cwd()
    transcript_dir = workdir / ".transcripts"
    transcript_dir.mkdir(exist_ok=True)

    # 1. 持久化完整上下文
    timestamp = int(time.time())
    path = transcript_dir / f"transcript_{timestamp}.jsonl"
    with open(path, "w", encoding="utf-8") as f:
        for msg in messages:
            f.write(json.dumps(msg, default=str) + "\n")

    # 2. 用 LLM 摘要
    if llm_adapter is None or model is None:
        # 没有 LLM 时，返回纯文本摘要
        conv_text = json.dumps(messages, default=str)[-80000:]
        summary = f"[Transcript saved to {path}]\n[Content preview: {conv_text[-1000:]}]"
        return [{"role": "user", "content": f"[Compressed. Transcript: {path}]\n{summary}"}]

    # 取最近 80000 字符发送给 LLM
    conv_text = json.dumps(messages, default=str)[-80000:]
    resp = llm_adapter.create(
        model=model,
        messages=[{"role": "user", "content": f"Summarize for continuity:\n{conv_text}"}],
        max_tokens=max_summarize_tokens,
    )
    summary = getattr(resp, "text", None) or (
        resp.content[0].text if hasattr(resp.content[0], "text") else str(resp.content)
    )

    # 3. 返回压缩后的单条摘要消息
    return [
        {"role": "user", "content": f"[Compressed. Transcript: {path}]\n{summary}"}
    ]
