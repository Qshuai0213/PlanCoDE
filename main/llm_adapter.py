"""
llm_adapter.py - 统一 LLM 接口层

支持多 Provider：
- anthropic（默认）：Anthropic API
- openai：OpenAI API 或任何 OpenAI-compatible API（DeepSeek、Groq、Ollama 等）

核心设计：
- create() 直接传 tools 给 SDK，SDK 返回的 tool_use 结果标准化为统一格式
- 工具执行由调用方（agent_loop）负责，不在 adapter 内部做
- 返回 NormalizedResponse（content / stop_reason / tool_uses）
"""
import json
import os
from abc import ABC, abstractmethod


class NormalizedResponse:
    """
    统一响应格式 — 兼容 Anthropic block 结构

    各 Adapter 返回同样结构，调用方无需关心底层 Provider 差异。
    """

    def __init__(self, content, stop_reason, tool_uses, assistant_content=None):
        # content: str
        # stop_reason: str ("tool_use" | "end_turn" | ...)
        # tool_uses: list — 每个元素有 .type, .id, .name, .input
        self.content = content
        self.stop_reason = stop_reason
        self.tool_uses = tool_uses
        self.assistant_content = assistant_content


class LLMAdapter(ABC):
    @abstractmethod
    def create(self, *, model: str, system: str, messages: list,
               tools: list, max_tokens: int,
               timeout: int = None) -> NormalizedResponse:
        ...


class AnthropicAdapter(LLMAdapter):
    def create(self, *, model: str, system: str, messages: list,
               tools: list, max_tokens: int,
               timeout: int = None) -> NormalizedResponse:
        from anthropic import Anthropic
        client = Anthropic(
            api_key=os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"),
            base_url=os.environ.get("ANTHROPIC_BASE_URL") or None,
        )
        kwargs = dict(
            model=model,
            system=system,
            messages=messages,
            tools=tools,
            max_tokens=max_tokens,
        )
        if timeout:
            kwargs["timeout"] = timeout
        resp = client.messages.create(**kwargs)

        # content 标准化为字符串，tool_uses 收集所有工具调用
        content_text = "".join(
            b.text for b in resp.content
            if hasattr(b, "text") and b.type == "text"
        )
        tool_uses = [b for b in resp.content if b.type == "tool_use"]
        assistant_content = []
        for block in resp.content:
            if block.type == "text":
                assistant_content.append({"type": "text", "text": getattr(block, "text", "")})
            elif block.type == "tool_use":
                assistant_content.append({
                    "type": "tool_use",
                    "id": getattr(block, "id", ""),
                    "name": getattr(block, "name", ""),
                    "input": getattr(block, "input", {}),
                })
        return NormalizedResponse(content_text, resp.stop_reason, tool_uses, assistant_content=assistant_content)


class OpenAIAdapter(LLMAdapter):
    """
    OpenAI SDK 或任何 OpenAI-compatible API（DeepSeek、Groq、Ollama 等）

    使用 OPENAI_API_KEY + OPENAI_BASE_URL 环境变量。
    """

    def create(self, *, model: str, system: str, messages: list,
               tools: list, max_tokens: int,
               timeout: int = None) -> NormalizedResponse:
        from openai import OpenAI
        client = OpenAI(
            api_key=os.environ.get("OPENAI_API_KEY"),
            base_url=os.environ.get("OPENAI_BASE_URL") or "https://api.openai.com/v1",
        )
        kwargs = dict(
            model=model,
            messages=[{"role": "system", "content": system}] + messages,
            tools=tools,
            max_tokens=max_tokens,
        )
        if timeout:
            kwargs["timeout"] = timeout
        resp = client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        content_text = choice.message.content or ""
        stop_reason = choice.finish_reason

        # 工具调用：标准化为 tool_use block
        tool_uses = []
        if choice.message.tool_calls:
            for call in choice.message.tool_calls:
                tool_uses.append(_make_tool_use_block(
                    call.id,
                    call.function.name,
                    json.loads(call.function.arguments) if isinstance(call.function.arguments, str) else call.function.arguments,
                ))

        assistant_content = content_text
        return NormalizedResponse(content_text, stop_reason, tool_uses, assistant_content=assistant_content)


def _make_tool_use_block(id: str, name: str, input: dict):
    """创建与 Anthropic tool_use block 相同接口的对象"""
    return type("ToolUseBlock", (), {
        "type": "tool_use",
        "id": id,
        "name": name,
        "input": input,
    })()


def create_llm_client() -> LLMAdapter:
    """工厂函数：根据 LLM_PROVIDER 环境变量创建对应的 Adapter"""
    provider = os.environ.get("LLM_PROVIDER", "anthropic").lower()
    if provider == "openai":
        return OpenAIAdapter()
    return AnthropicAdapter()
