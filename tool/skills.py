"""
skills.py - 技能加载器
"""
import re
from pathlib import Path


class SkillLoader:
    """
    技能加载器，从 skills/ 目录读取 SKILL.md 文件。

    目录结构（兼容 Claude Code）：
        skills/
        ├── git/
        │   └── SKILL.md
        └── python/
            └── SKILL.md

    SKILL.md 格式（YAML frontmatter + body）：
        ---
        name: git
        description: Git version control operations
        user-invocable: true
        allowed-tools:
          - Read
          - Bash(echo *)
        ---
        # Git Skills
        ...knowledge body...

        Arguments passed: $ARGUMENTS
    """

    def __init__(self, skills_dir: Path = None):
        self.skills_dir = skills_dir or (Path.cwd() / "skills")
        self.skills = self._load()

    def _load(self) -> dict:
        """扫描 skills_dir 下所有 SKILL.md，构建 skills 字典"""
        if not self.skills_dir.exists():
            return {}
        skills = {}
        for f in sorted(self.skills_dir.rglob("SKILL.md")):
            text = f.read_text(encoding="utf-8")
            match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
            meta, body = {}, text
            if match:
                meta = self._parse_frontmatter(match.group(1))
                body = match.group(2).strip()
            name = meta.get("name", f.parent.name)
            allowed_raw = meta.get("allowed-tools", "")
            allowed_tools = []
            if allowed_raw:
                for line in allowed_raw.splitlines():
                    stripped = line.strip()
                    if stripped:
                        allowed_tools.append(stripped)
            user_invocable = meta.get("user-invocable", "").lower() == "true"
            skills[name] = {
                "meta": meta,
                "body": body,
                "user_invocable": user_invocable,
                "allowed_tools": allowed_tools,
            }
        return skills

    def _parse_frontmatter(self, raw: str) -> dict:
        """解析 YAML frontmatter（简化实现）"""
        meta = {}
        current_key = None
        for line in raw.strip().splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("-"):
                val = stripped.lstrip("-").strip()
                if current_key and val:
                    meta[current_key] = meta.get(current_key, "") + "\n" + val
                continue
            if ":" in line:
                k, v = line.split(":", 1)
                current_key = k.strip()
                meta[current_key] = v.strip()
        return meta

    def descriptions(self) -> str:
        if not self.skills:
            return "(no skills)"
        lines = []
        for n, s in self.skills.items():
            desc = s["meta"].get("description", "-")
            invocable = " [user-invocable]" if s["user_invocable"] else ""
            lines.append(f"  - {n}: {desc}{invocable}")
        return "\n".join(lines)

    def load(self, name: str) -> str:
        s = self.skills.get(name)
        if not s:
            available = ", ".join(self.skills.keys()) or "(none)"
            return f"Error: Unknown skill '{name}'. Available: {available}"
        return f'<skill name="{name}">\n{s["body"]}\n</skill>'

    def is_user_invocable(self, name: str) -> bool:
        s = self.skills.get(name)
        return s["user_invocable"] if s else False

    def get_allowed_tools(self, name: str) -> list:
        s = self.skills.get(name)
        return s["allowed_tools"] if s else []

    def user_invocable_skills(self) -> dict:
        return {
            n: s["meta"].get("description", "-")
            for n, s in self.skills.items()
            if s["user_invocable"]
        }


_SKILLS: SkillLoader = None
_SKILLS_DIR: Path | None = None


def get_skills() -> SkillLoader:
    global _SKILLS
    if _SKILLS is None:
        _SKILLS = SkillLoader(_SKILLS_DIR)
    return _SKILLS


def set_skills_dir(skills_dir: Path | None):
    global _SKILLS, _SKILLS_DIR
    _SKILLS_DIR = Path(skills_dir) if skills_dir else None
    _SKILLS = SkillLoader(_SKILLS_DIR)
