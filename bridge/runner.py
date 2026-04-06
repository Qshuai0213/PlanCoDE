"""PlanCoDE Runner - receives Electron commands and streams events over stdout."""
import json
import os
import sys
import threading
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def resolve_project_root() -> Path:
    bridge_dir = Path(__file__).resolve().parent
    candidates = [
        bridge_dir.parent,
        bridge_dir.parent.parent,
    ]

    for candidate in candidates:
        if (candidate / "main").exists() and (candidate / "bridge").exists():
            return candidate

    return bridge_dir.parent


PROJECT_ROOT = resolve_project_root()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from bridge.ipc_callback import IpcCallback


def read_stdin_thread(callback: IpcCallback):
    """Read stdin in a background thread and forward control messages."""
    for line in sys.stdin:
        try:
            msg = json.loads(line.strip())
            if msg.get("type") == "stop":
                os._exit(0)
            if msg.get("type") == "dangerous_confirm":
                callback.feed_confirm(msg.get("allow", False), msg.get("allow_all", False))
        except (json.JSONDecodeError, Exception):
            pass


def run_agent(
    agent_type: str,
    workdir: str,
    goal: str = None,
    plan: str = None,
    plan_path: str = None,
    design_path: str = None,
    prompt: str = None,
    messages: str = None,
):
    os.environ.setdefault("PYTHONUNBUFFERED", "1")

    stdin_lock = threading.Lock()
    callback = IpcCallback(stdin_lock)
    threading.Thread(target=read_stdin_thread, args=(callback,), daemon=True).start()

    wd = Path(workdir)

    if agent_type == "plan":
        from main.plan_agent import PlanAgent

        agent = PlanAgent(workdir=wd)
        result = agent.run(goal=goal or "", event_callback=callback)
    elif agent_type == "design":
        from main.design_agent import DesignAgent

        agent = DesignAgent(workdir=wd)
        result = agent.run(plan=plan, plan_path=Path(plan_path) if plan_path else None, event_callback=callback)
    elif agent_type == "execute":
        from main.execute_agent import ExecuteAgent

        agent = ExecuteAgent(workdir=wd)
        p_path = Path(plan_path) if plan_path else (wd / "plan.md")
        d_path = Path(design_path) if design_path else (wd / "design.md")
        result = agent.run(plan_path=p_path, design_path=d_path, event_callback=callback)
    elif agent_type == "general":
        from main.general_agent import GeneralAgent

        agent = GeneralAgent(workdir=wd)
        parsed_messages = json.loads(messages) if messages else None
        result = agent.run(prompt=prompt or "", messages=parsed_messages, event_callback=callback)
    else:
        return

    print(
        json.dumps(
            {
                "type": "result",
                "agent": agent_type,
                "content": result.content if hasattr(result, "content") else str(result),
                "round_count": result.round_count if hasattr(result, "round_count") else 0,
                "tool_call_count": len(result.tool_calls) if hasattr(result, "tool_calls") else 0,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


def main():
    import argparse

    parser = argparse.ArgumentParser(description="PlanCoDE Runner - stdin/stdout IPC bridge")
    parser.add_argument("--agent", required=True, choices=["plan", "design", "execute", "general"])
    parser.add_argument("--goal", type=str, default=None)
    parser.add_argument("--plan", type=str, default=None, help="Plan content")
    parser.add_argument("--plan-path", type=str, default=None)
    parser.add_argument("--design-path", type=str, default=None)
    parser.add_argument("--prompt", type=str, default=None)
    parser.add_argument("--messages", type=str, default=None)
    parser.add_argument("--workdir", type=str, default=".")
    args = parser.parse_args()

    run_agent(
        agent_type=args.agent,
        workdir=args.workdir,
        goal=args.goal,
        plan=args.plan,
        plan_path=args.plan_path,
        design_path=args.design_path,
        prompt=args.prompt,
        messages=args.messages,
    )


if __name__ == "__main__":
    main()
