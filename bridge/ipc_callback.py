"""PlanCoDE IpcCallback - maps EventCallback events to stdout JSON."""
import json
import threading

from agent.agent_loop import EventCallback


class IpcCallback(EventCallback):
    """Write EventCallback events to stdout for the Electron main process."""

    def __init__(self, stdin_lock: threading.Lock):
        self._stdin_lock = stdin_lock
        self._confirm_event = threading.Event()
        self._confirm_result: tuple[bool, bool] | None = None

        # Keep the same runtime fields as EventCollector so agent_loop / RunResult can use us directly.
        self.events = []
        self.thinking = ""
        self.tool_calls = []
        self.final_content = ""
        self.compact_count = 0
        self.round_count = 0

    def _emit(self, name: str, data):
        line = json.dumps({"type": "event", "name": name, "data": data}, ensure_ascii=False)
        print(line, flush=True)

    def on_thinking(self, content: str):
        self.thinking = content
        self.events.append({"type": "thinking", "content": content})
        self._emit("on_thinking", content)

    def on_tool_call(self, tool_name: str, input: dict):
        self.tool_calls.append({"name": tool_name, "input": input, "output": None})
        self.events.append({"type": "tool_call", "name": tool_name, "input": input})
        self._emit("on_tool_call", {"name": tool_name, "input": input})

    def on_tool_result(self, tool_name: str, output: str):
        output_text = str(output)[:5000]
        if self.tool_calls and self.tool_calls[-1]["name"] == tool_name and self.tool_calls[-1]["output"] is None:
            self.tool_calls[-1]["output"] = output_text
        self.events.append({"type": "tool_result", "name": tool_name, "output": output_text})
        self._emit("on_tool_result", {"name": tool_name, "output": output_text})

    def on_compact(self):
        self.compact_count += 1
        self.events.append({"type": "compact"})
        self.thinking = ""
        self.tool_calls = []
        self._emit("on_compact", None)

    def on_inbox(self, messages: list):
        self.events.append({"type": "inbox", "messages": messages})
        self._emit("on_inbox", messages)

    def on_bg_result(self, results: list):
        self.events.append({"type": "bg_result", "results": results})
        self._emit("on_bg_result", results)

    def on_loop_end(self, final_content: str):
        self.final_content = final_content or ""
        self.events.append({"type": "end", "content": self.final_content})
        self._emit("on_loop_end", self.final_content)

    def on_dangerous(self, command: str, tool: str) -> tuple[bool, bool]:
        self.events.append({"type": "dangerous", "command": command, "tool": tool})
        self._emit("dangerous", {"command": command, "tool": tool})
        self._confirm_event.wait()
        result = self._confirm_result
        self._confirm_event.clear()
        return result  # type: ignore

    def feed_confirm(self, allow: bool, allow_all: bool):
        self._confirm_result = (allow, allow_all)
        self._confirm_event.set()
