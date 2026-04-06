"""
model_config.py - 模型配置管理

本地持久化存储，支持添加/编辑/删除/查询。
默认配置文件路径: ~/.plancode/models.json
"""
import json
import os
from pathlib import Path


DEFAULT_CONFIG_PATH = Path.home() / ".plancode" / "models.json"


def _load() -> dict:
    if not DEFAULT_CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(DEFAULT_CONFIG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, IOError):
        return {}


def _save(data: dict):
    DEFAULT_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = DEFAULT_CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, DEFAULT_CONFIG_PATH)


# ==================== 公开接口 ====================

def list_models() -> list:
    """列出所有已保存的模型配置"""
    data = _load()
    return [
        {
            "name": name,
            "provider": cfg.get("provider", "anthropic"),
            "model": cfg.get("model", name),
            "api_key_env": cfg.get("api_key_env", ""),
            "base_url": cfg.get("base_url", ""),
        }
        for name, cfg in data.items()
    ]


def add_model(
    name: str,
    provider: str = "anthropic",
    model: str = None,
    api_key_env: str = None,
    base_url: str = None,
) -> str:
    """
    添加一个模型配置。

    参数:
        name:        配置名（如 "claude-sonnet"）
        provider:    提供商（anthropic / openai，默认 anthropic）
        model:      模型 ID（默认等于 name）
        api_key_env: API key 环境变量名（如 "ANTHROPIC_API_KEY"）
        base_url:   API base URL（如 "https://api.anthropic.com"，可选）
    返回:
        成功信息
    """
    if not name:
        raise ValueError("name is required")

    data = _load()
    data[name] = {
        "provider": provider,
        "model": model or name,
        "api_key_env": api_key_env or "",
        "base_url": base_url or "",
    }
    _save(data)
    return f"Model '{name}' added: {provider}/{model or name}"


def update_model(name: str, **fields) -> str:
    """
    更新某个模型配置的部分字段。

    参数:
        name:   配置名
        **fields: 要更新的字段（provider / model / api_key_env / base_url）
    返回:
        成功信息
    """
    data = _load()
    if name not in data:
        return f"Error: model '{name}' not found"

    for k in ("provider", "model", "api_key_env", "base_url"):
        if k in fields:
            data[name][k] = fields[k]
    _save(data)
    return f"Model '{name}' updated"


def delete_model(name: str) -> str:
    """删除某个模型配置"""
    data = _load()
    if name not in data:
        return f"Error: model '{name}' not found"
    del data[name]
    _save(data)
    return f"Model '{name}' deleted"


def get_model(name: str) -> dict:
    """获取某个模型配置的完整信息，不存在返回空 dict"""
    data = _load()
    return dict(data.get(name, {}))


def get_default() -> str:
    """获取默认模型名（DEFAULT_MODEL 环境变量，fallback 到第一个）"""
    env = os.environ.get("DEFAULT_MODEL")
    if env:
        return env
    data = _load()
    if data:
        return next(iter(data.keys()))
    return "claude-sonnet-4-20250514"


def set_default(name: str) -> str:
    """设置默认模型（写入 DEFAULT_MODEL 环境变量）"""
    data = _load()
    if name not in data:
        return f"Error: model '{name}' not found"
    os.environ["DEFAULT_MODEL"] = name
    # 也持久化到配置文件
    data["_default"] = name
    _save(data)
    return f"Default model set to '{name}'"


def show_config() -> str:
    """打印所有配置（格式化输出）"""
    models = list_models()
    default = get_default()
    if not models:
        return "No models configured. Use add_model() to add one."

    lines = [f"Default: {default}", ""]
    for m in models:
        marker = " *" if m["name"] == default else ""
        lines.append(f"  [{m['name']}]{marker}")
        lines.append(f"    provider: {m['provider']}")
        lines.append(f"    model:    {m['model']}")
        if m.get("base_url"):
            lines.append(f"    base_url: {m['base_url']}")
        if m.get("api_key_env"):
            lines.append(f"    api_key:  ${m['api_key_env']}")
    return "\n".join(lines)
