#!/usr/bin/env python
from __future__ import annotations

import asyncio
import json
import re
import sys
from collections.abc import AsyncIterator, Callable
from importlib.metadata import version
from pathlib import Path
from typing import Any

import django
from django.conf import settings

RUN = "uv run --no-project --with 'django-ag-ui[harness]==0.91.0' python scripts/record_task_control_fixture.py"  # noqa: E501

settings.configure(
    SECRET_KEY="record",
    DEBUG=False,
    ALLOWED_HOSTS=["*"],
    INSTALLED_APPS=[],
    DATABASES={},
    MIDDLEWARE=[],
    USE_TZ=True,
)
django.setup()

from django.test import RequestFactory  # noqa: E402
from django_ag_ui import SubAgentObserver  # noqa: E402
from django_ag_ui.agent.agui_view import DjangoAGUIView  # noqa: E402
from django_ag_ui.agent.subagent_progress import subagent_progress  # noqa: E402
from django_spec_agents.registry.tool_registry import ToolRegistry  # noqa: E402
from pydantic_ai import Agent  # noqa: E402
from pydantic_ai.messages import ModelMessage, ModelRequest, ToolReturnPart  # noqa: E402
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel  # noqa: E402
from pydantic_ai.toolsets import FunctionToolset  # noqa: E402
from pydantic_ai_harness.sub_agents import SubAgent, SubAgents, TaskControl  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "subagent_task_control.json"
TASK_ID = re.compile(r"Task ([0-9a-f]{32})")
Step = Callable[[list[ModelMessage]], Any]


def _call(name: str, args: dict[str, Any], tool_call_id: str) -> dict[int, DeltaToolCall]:
    return {0: DeltaToolCall(name=name, json_args=json.dumps(args), tool_call_id=tool_call_id)}


def _task_id(messages: list[ModelMessage]) -> str:
    for message in messages:
        if isinstance(message, ModelRequest):
            for part in message.parts:
                if isinstance(part, ToolReturnPart) and (found := TASK_ID.search(str(part.content))):
                    return found.group(1)
    raise AssertionError("no task id in the history")


def _played(steps: list[Step]) -> Any:
    remaining = list(steps)

    async def stream(messages: list[ModelMessage], info: AgentInfo) -> AsyncIterator[Any]:
        step = remaining.pop(0) if len(remaining) > 1 else remaining[0]
        yield step(messages)

    return stream


def _researcher(*steps: Step, delay: float = 0.0) -> Agent[Any, Any]:
    async def read_handbook(phrase: str) -> str:
        """Look a phrase up in the handbook."""
        await asyncio.sleep(delay)
        return f"Three passages mention {phrase}."

    return Agent(
        FunctionModel(stream_function=_played(list(steps))),
        name="researcher",
        description="Looks phrases up in the handbook.",
        toolsets=[FunctionToolset([read_handbook])],
    )


def _reads(delay: float = 0.0) -> Agent[Any, Any]:
    return _researcher(
        lambda m: _call("read_handbook", {"phrase": "settlement"}, "sub-1"),
        lambda m: "Three passages mention settlement.",
        delay=delay,
    )


def _delegate(tool_call_id: str = "call-1", **extra: Any) -> Step:
    args = {"agent_name": "researcher", "task": "Find them.", **extra}
    return lambda m: _call("delegate_task", args, tool_call_id)


async def _stream(child: Agent[Any, Any], *parent: Step) -> list[dict[str, Any]]:
    view = DjangoAGUIView(
        ToolRegistry(),
        model=FunctionModel(stream_function=_played(list(parent))),
        require_authenticated=False,
        csrf_exempt=True,
        capabilities=[
            SubAgentObserver(
                SubAgents(agents=[SubAgent(child)], agent_folders=None, task_control=TaskControl())
            )
        ],
    )
    body = json.dumps(
        {
            "threadId": "thread-fixture",
            "runId": "run-fixture",
            "state": {},
            "messages": [{"id": "user-1", "role": "user", "content": "Find the passages."}],
            "tools": [],
            "context": [],
            "forwardedProps": {},
        }
    ).encode()
    response = await view(RequestFactory().post("/agent/", data=body, content_type="application/json"))
    sse = ""
    async for chunk in response.streaming_content:
        sse += chunk if isinstance(chunk, str) else chunk.decode()
    return [json.loads(line[6:]) for line in sse.splitlines() if line.startswith("data: ")]


def _steer(m: list[ModelMessage]) -> Any:
    return _call("message_task", {"task_id": _task_id(m), "message": "Only 2024."}, "call-2")


def _cancel(m: list[ModelMessage]) -> Any:
    return _call("cancel_task", {"task_id": _task_id(m), "force": True}, "call-2")


def _answer(m: list[ModelMessage]) -> Any:
    return _call("answer_task", {"task_id": _task_id(m), "answer": "2024"}, "call-2")


def _resume(m: list[ModelMessage]) -> Any:
    args = {"agent_name": "researcher", "task": "And 2023?", "resume": _task_id(m)}
    return _call("delegate_task", args, "call-2")


def _fails(m: list[ModelMessage]) -> Any:
    raise RuntimeError("the parent model went away")


def _asks() -> Agent[Any, Any]:
    return _researcher(
        lambda m: _call("ask_parent", {"question": "Which year?"}, "sub-q"),
        lambda m: "2024 it is.",
    )


async def _runs() -> dict[str, list[dict[str, Any]]]:
    done: Step = lambda m: "Done."  # noqa: E731
    return {
        "steered": await _stream(_reads(0.3), _delegate(background=True), _steer, done),
        "question": await _stream(_asks(), _delegate(), _answer, done),
        "cancelled": await _stream(_reads(5.0), _delegate(background=True), _cancel, done),
        "resumed": await _stream(_reads(), _delegate(), _resume, done),
        "unfinished": await _stream(_reads(5.0), _delegate(background=True), _fails),
    }


def _retried() -> dict[str, Any]:
    event = subagent_progress(
        delegation_id="call-1",
        agent="researcher",
        phase="retried",
        status="researcher: retrying, attempt 2",
        task={"taskId": "task-1", "attempt": 2},
    )
    return json.loads(event.model_dump_json(by_alias=True, exclude_none=True))


def _by_user() -> dict[str, Any]:
    # The steps a task route reports, built as django-ag-ui's LiveTasks._report builds them.
    steps = {
        "steered": ("steered by you", {"message": "Only 2024."}),
        "answered": ("answered by you", {"questionId": "q-1", "answer": "2024"}),
        "cancel_requested": ("cancellation requested by you", {"forced": False}),
    }
    return {
        phase: json.loads(
            subagent_progress(
                delegation_id="call-1",
                agent="researcher",
                phase=phase,
                status=f"researcher: {said}",
                task={"taskId": "task-1", **task, "source": "user"},
            ).model_dump_json(by_alias=True, exclude_none=True)
        )
        for phase, (said, task) in steps.items()
    }


def _normalise(text: str) -> str:
    text = re.sub(r'"timestamp": \d+', '"timestamp": 1735689600000', text)
    uuid = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    for kind, pattern in (("message", uuid), ("task", r"[0-9a-f]{32}"), ("q", r"[0-9a-f]{12}")):
        names: dict[str, str] = {}
        text = re.sub(
            rf"\b{pattern}\b",
            lambda m, k=kind: names.setdefault(m.group(0), f"{k}-{len(names) + 1}"),
            text,
        )
    return text


def record() -> dict[str, Any]:
    return {
        "generator": "scripts/record_task_control_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "pydanticAiHarness": version("pydantic-ai-harness"),
        "agUiProtocol": version("ag-ui-protocol"),
        "canonicalized": ["timestamp", "uuid ids", "task ids"],
        "runs": asyncio.run(_runs()),
        "retried": _retried(),
        "byUser": _by_user(),
    }


if __name__ == "__main__":
    OUT.write_text(_normalise(json.dumps(record(), indent=2)) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
