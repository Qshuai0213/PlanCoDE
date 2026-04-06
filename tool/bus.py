"""
bus.py - 消息总线
"""
import json
import time
from pathlib import Path


class MessageBus:
    """
    消息总线

    改进：读 inbox 使用原子 rename，先写到临时文件再 rename 回原文件，
    避免进程崩溃导致消息丢失。
    """

    def __init__(self, inbox_dir: Path = None):
        self._inbox_dir = inbox_dir or (Path.cwd() / ".team" / "inbox")
        self._inbox_dir.mkdir(parents=True, exist_ok=True)

    def _inbox_path(self, name: str) -> Path:
        return self._inbox_dir / f"{name}.jsonl"

    def send(self, sender: str, to: str, content: str,
             msg_type: str = "message", extra: dict = None) -> str:
        msg = {
            "type": msg_type,
            "from": sender,
            "content": content,
            "timestamp": time.time()
        }
        if extra:
            msg.update(extra)
        line = json.dumps(msg, ensure_ascii=False) + "\n"
        with open(self._inbox_path(to), "a", encoding="utf-8") as f:
            f.write(line)
        return f"Sent {msg_type} to {to}"

    def read_inbox(self, name: str) -> list:
        """原子读取：先 rename 到临时文件，再读，处理崩溃风险"""
        path = self._inbox_path(name)
        if not path.exists():
            return []

        tmp = path.with_suffix(".processing")
        try:
            path.rename(tmp)
        except OSError:
            import shutil
            shutil.copy(path, tmp)
            try:
                path.unlink()
            except OSError:
                pass

        try:
            content = tmp.read_text(encoding="utf-8")
            msgs = [json.loads(l) for l in content.strip().splitlines() if l]
        except Exception:
            msgs = []
        finally:
            tmp.unlink(missing_ok=True)

        return msgs

    def broadcast(self, sender: str, content: str, names: list) -> str:
        count = 0
        for n in names:
            if n != sender:
                self.send(sender, n, content, "broadcast")
                count += 1
        return f"Broadcast to {count} teammates"


_BUS: MessageBus = None


def get_bus() -> MessageBus:
    global _BUS
    if _BUS is None:
        _BUS = MessageBus()
    return _BUS
