"""
skills.py - skill loader
"""
import os
import re
from pathlib import Path


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _strip_wrapping_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def _dedupe_paths(paths: list[Path]) -> list[Path]:
    seen: set[str] = set()
    result: list[Path] = []
    for item in paths:
        key = str(item.resolve(strict=False))
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


def discover_skill_roots(skills_dir: Path | None = None, workdir: Path | None = None) -> list[Path]:
    roots: list[Path] = []

    if skills_dir:
        roots.append(Path(skills_dir))

    if workdir:
        roots.append(Path(workdir) / "skills")

    extra_dirs = os.environ.get("PLANCODE_SKILLS_DIRS", "")
    if extra_dirs:
        for raw in extra_dirs.split(os.pathsep):
            if raw.strip():
                roots.append(Path(raw.strip()))

    roots.append(_project_root() / "skills")

    return [root for root in _dedupe_paths(roots) if root.exists() and root.is_dir()]


class SkillLoader:
    """
    Load skills from one or more skills directories.
    Local skills take precedence over global skills when names collide.
    """

    def __init__(self, skills_dir: Path | None = None, workdir: Path | None = None):
        self.workdir = Path(workdir) if workdir else None
        self.primary_dir = Path(skills_dir) if skills_dir else None
        self.skill_roots = discover_skill_roots(self.primary_dir, self.workdir)
        self.skills = self._load()

    def _load(self) -> dict:
        skills = {}
        for root in self.skill_roots:
            for file_path in sorted(root.rglob("SKILL.md")):
                text = file_path.read_text(encoding="utf-8")
                match = re.match(r"^---\n(.*?)\n---\n(.*)", text, re.DOTALL)
                meta, body = {}, text
                if match:
                    meta = self._parse_frontmatter(match.group(1))
                    body = match.group(2).strip()

                name = meta.get("name", file_path.parent.name)
                if name in skills:
                    continue

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
                    "source_file": file_path,
                    "source_root": root,
                }
        return skills

    def _parse_frontmatter(self, raw: str) -> dict:
        meta = {}
        current_key = None
        for line in raw.strip().splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("-"):
                value = stripped.lstrip("-").strip()
                if current_key and value:
                    meta[current_key] = meta.get(current_key, "") + "\n" + _strip_wrapping_quotes(value)
                continue
            if ":" in line:
                key, value = line.split(":", 1)
                current_key = key.strip()
                meta[current_key] = _strip_wrapping_quotes(value.strip())
        return meta

    def descriptions(self) -> str:
        if not self.skills:
            return "(no skills)"
        lines = []
        for name, skill in self.skills.items():
            desc = skill["meta"].get("description", "-")
            source = skill["source_root"].name
            invocable = " [user-invocable]" if skill["user_invocable"] else ""
            lines.append(f"  - {name}: {desc} ({source}){invocable}")
        return "\n".join(lines)

    def load(self, name: str) -> str:
        skill = self.skills.get(name)
        if not skill:
            available = ", ".join(self.skills.keys()) or "(none)"
            return f"Error: Unknown skill '{name}'. Available: {available}"

        source_file = skill["source_file"]
        return f'<skill name="{name}" source="{source_file}">\n{skill["body"]}\n</skill>'

    def is_user_invocable(self, name: str) -> bool:
        skill = self.skills.get(name)
        return skill["user_invocable"] if skill else False

    def get_allowed_tools(self, name: str) -> list:
        skill = self.skills.get(name)
        return skill["allowed_tools"] if skill else []

    def user_invocable_skills(self) -> dict:
        return {
            name: skill["meta"].get("description", "-")
            for name, skill in self.skills.items()
            if skill["user_invocable"]
        }


_SKILLS: SkillLoader | None = None
_SKILLS_DIR: Path | None = None
_SKILLS_WORKDIR: Path | None = None


def get_skills() -> SkillLoader:
    global _SKILLS
    if _SKILLS is None:
        _SKILLS = SkillLoader(_SKILLS_DIR, workdir=_SKILLS_WORKDIR)
    return _SKILLS


def set_skills_dir(skills_dir: Path | None, workdir: Path | None = None):
    global _SKILLS, _SKILLS_DIR, _SKILLS_WORKDIR
    _SKILLS_DIR = Path(skills_dir) if skills_dir else None
    _SKILLS_WORKDIR = Path(workdir) if workdir else None
    _SKILLS = SkillLoader(_SKILLS_DIR, workdir=_SKILLS_WORKDIR)
