#!/usr/bin/env python
"""Record django-ag-ui's detached-run routes into ``tests/fixtures/detached_runs.json``.

Every body here is what a real ``AGUIServer`` mount with a run store answers:
the run's own POST, ``threads/<id>/events/`` as SSE and as a JSON page, the
``409`` a second start gets, and ``threads/<id>/cancel/``. Nothing is typed by
hand; the script only chooses the thread ids, the prompts and when the model
speaks.

A run outlives its request only under ASGI, so everything is driven through
``AsyncRequestFactory`` on one event loop, the way django-ag-ui's own
``test_events_view.py`` drives it. Run it with the released server::

    uv run -q --no-project --python 3.12 --with 'django-ag-ui[harness]==0.91.0' python scripts/record_detached_fixture.py

Ids the server mints (message ids, tool call ids it names itself) and
timestamps are replaced by stable placeholders, so a regeneration diffs clean.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
import tempfile
from importlib.metadata import version
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import django
from django.conf import settings

DB = Path(tempfile.mkdtemp()) / "detached.sqlite3"
settings.configure(
    SECRET_KEY="record",
    DEBUG=False,
    ALLOWED_HOSTS=["*"],
    USE_TZ=True,
    INSTALLED_APPS=[
        "django.contrib.contenttypes",
        "django.contrib.auth",
        "django_spec_agents.contrib.store",
    ],
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": str(DB)}},
    MIDDLEWARE=[],
    DEFAULT_AUTO_FIELD="django.db.models.AutoField",
)
django.setup()

from django.core.management import call_command  # noqa: E402
from django.test import AsyncRequestFactory  # noqa: E402
from django_spec_agents.contrib.store.default_conversation_store import (  # noqa: E402
    DefaultConversationStore,
)
from django_spec_agents.contrib.store.default_run_store import DefaultRunStore  # noqa: E402
from django_spec_agents.persistence.types.thread_run_status import (  # noqa: E402
    ThreadRunStatus,
)
from django_spec_agents.registry.tool_registry import ToolRegistry  # noqa: E402
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel  # noqa: E402

from django_ag_ui.agent import run_owner as run_owner_module  # noqa: E402
from django_ag_ui.agent.agui_server import AGUIServer  # noqa: E402
from django_ag_ui.config.build_ag_ui_config import build_ag_ui_config  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "detached_runs.json"
SSE = {"Accept": "text/event-stream"}
PICK = {
    "name": "pick_colour",
    "description": "Let the person pick a colour.",
    "parameters": {"type": "object", "properties": {}},
}


class _Factory(AsyncRequestFactory):
    """Every request carries the logged-in owner the run store scopes threads to."""

    def request(self, **request: Any) -> Any:
        built = super().request(**request)
        built.user = SimpleNamespace(is_authenticated=True, pk=1, username="owner")
        return built


class _Gate:
    """Says something, then waits until the recorder lets the run finish."""

    def __init__(self) -> None:
        self.release = asyncio.Event()

    def model(self) -> FunctionModel:
        async def stream_fn(messages: list, info: AgentInfo) -> Any:
            parts = [p for m in messages for p in getattr(m, "parts", [])]
            if any(getattr(p, "part_kind", "") == "tool-return" for p in parts):
                yield "You picked it."
                return
            if info.function_tools:
                yield {0: DeltaToolCall(name="pick_colour", json_args="{}", tool_call_id="call-1")}
                return
            yield "partial answer"
            await self.release.wait()
            yield " and the rest"

        return FunctionModel(stream_function=stream_fn)


def _server(gate: _Gate) -> AGUIServer:
    return AGUIServer(
        ToolRegistry(),
        model=gate.model(),
        csrf_exempt=True,
        conversation_store=DefaultConversationStore(),
        run_store=DefaultRunStore(),
        config=build_ag_ui_config(heartbeat_seconds=0, run_timeout_seconds=300),
    )


def _route(server: AGUIServer, name: str) -> Any:
    patterns, _, _ = server.urls
    return next(p for p in patterns if p.name == name).callback


def _body(thread_id: str, run_id: str, messages: list[dict[str, Any]], **extra: Any) -> bytes:
    return json.dumps(
        {
            "threadId": thread_id,
            "runId": run_id,
            "state": {},
            "messages": messages,
            "tools": extra.get("tools", []),
            "context": [],
            "forwardedProps": {"detach": True},
        }
    ).encode()


def _user(run_id: str, content: str = "hi") -> dict[str, Any]:
    return {"id": f"u-{run_id}", "role": "user", "content": content}


async def _start(server: AGUIServer, body: bytes) -> Any:
    request = _Factory().post("/agent/", data=body, content_type="application/json")
    return await _route(server, "endpoint")(request)


async def _chunks_until(stream: Any, needle: str) -> str:
    return await asyncio.wait_for(_read_until(stream, needle), 20)


async def _read_until(stream: Any, needle: str) -> str:
    seen = ""
    async for chunk in stream:
        seen += chunk if isinstance(chunk, str) else chunk.decode()
        if needle in seen:
            return seen
    raise AssertionError(f"never saw {needle!r}")


async def _drain(stream: Any) -> str:
    return await asyncio.wait_for(_read_all(stream), 20)


async def _read_all(stream: Any) -> str:
    return "".join([c if isinstance(c, str) else c.decode() async for c in stream])


async def _settled(thread_id: str) -> None:
    request = _Factory().get("/")
    for _ in range(500):
        state = await DefaultRunStore().get(thread_id, request=request)
        if state is not None and state.status is not ThreadRunStatus.RUNNING:
            return
        await asyncio.sleep(0.01)
    raise AssertionError("the run never settled")


async def _events(server: AGUIServer, thread_id: str, query: str, **headers: str) -> Any:
    request = _Factory().get(f"/agent/threads/{thread_id}/events/{query}", headers=headers)
    return await _route(server, "thread_events")(request, thread_id=thread_id)


async def _cancel(server: AGUIServer, thread_id: str) -> Any:
    request = _Factory().post(f"/agent/threads/{thread_id}/cancel/")
    return await _route(server, "thread_cancel")(request, thread_id=thread_id)


def _answer(response: Any) -> dict[str, Any]:
    return {"status": response.status_code, "body": json.loads(response.content)}


async def _running_thread() -> dict[str, Any]:
    """A detached run left by its client, probed, replayed from 0 and from mid-run, then 409'd."""
    gate = _Gate()
    server = _server(gate)
    first = await _start(server, _body("t1", "r1", [_user("r1", "Tell me the rest")]))
    stream = first.streaming_content
    live = await _chunks_until(stream, "partial answer")
    await stream.aclose()
    probe = await _events(server, "t1", "?after=0&limit=1")
    busy = await _start(server, _body("t1", "r2", [_user("r2", "And another thing")]))
    replay = (await _events(server, "t1", "?after=0", **SSE)).streaming_content
    opened = await _chunks_until(replay, "MESSAGES_SNAPSHOT")
    page = await _events(server, "t1", "?after=0")
    mid = (await _events(server, "t1", "?after=2", **SSE)).streaming_content
    mid_opened = await _chunks_until(mid, "MESSAGES_SNAPSHOT")
    gate.release.set()
    tail = await _drain(replay)
    mid_tail = await _drain(mid)
    await _settled("t1")
    finished = await _events(server, "t1", "?after=0&limit=1")
    never = await _events(server, "t-never", "?after=0&limit=1")
    return {
        "liveUntilDetach": live,
        "probeRunning": _answer(probe),
        "pageRunning": _answer(page),
        "probeIdle": _answer(finished),
        "probeNeverRan": _answer(never),
        "busyStart": _answer(busy),
        "replayFromStart": opened + tail,
        "replayFromMidRun": mid_opened + mid_tail,
    }


async def _cancelled_thread() -> dict[str, Any]:
    """A detached run cancelled through the route: 202, its replay to the end, then 404."""
    run_owner_module._WATCH_SECONDS = 0.01
    gate = _Gate()
    server = _server(gate)
    first = await _start(server, _body("t2", "r3", [_user("r3", "Write a long essay")]))
    stream = first.streaming_content
    await _chunks_until(stream, "partial answer")
    await stream.aclose()
    accepted = await _cancel(server, "t2")
    replay = await _drain((await _events(server, "t2", "?after=0", **SSE)).streaming_content)
    await _settled("t2")
    gate.release.set()
    again = await _cancel(server, "t2")
    return {"cancelAccepted": _answer(accepted), "cancelledReplay": replay, "cancelGone": _answer(again)}


async def _second_turn() -> dict[str, Any]:
    """A thread's second run, detached and replayed: its snapshot opens on the first turn."""
    done = _Gate()
    done.release.set()
    first = [_user("r6", "First question")]
    await _drain((await _start(_server(done), _body("t4", "r6", first))).streaming_content)
    await _settled("t4")
    stored = await DefaultConversationStore().load("t4", request=_Factory().get("/"))
    gate = _Gate()
    server = _server(gate)
    second = [*stored.messages, _user("r7", "Second question")]
    stream = (await _start(server, _body("t4", "r7", second))).streaming_content
    await _chunks_until(stream, "partial answer")
    await stream.aclose()
    replay = (await _events(server, "t4", "?after=0", **SSE)).streaming_content
    opened = await _chunks_until(replay, "MESSAGES_SNAPSHOT")
    gate.release.set()
    tail = await _drain(replay)
    await _settled("t4")
    return {"secondTurnReplay": opened + tail}


async def _client_tool_rounds() -> dict[str, Any]:
    """A detached run that ends on a client tool, then the round that answers it, detached too."""
    server = _server(_Gate())
    asked = [_user("r4", "Pick a colour for me")]
    first = await _drain((await _start(server, _body("t3", "r4", asked, tools=[PICK]))))
    await _settled("t3")
    parked = await _events(server, "t3", "?after=0&limit=1")
    call = [json.loads(line[6:]) for line in first.splitlines() if line.startswith("data: ")]
    message_id = next(e["parentMessageId"] for e in call if e["type"] == "TOOL_CALL_START")
    answered = [
        *asked,
        {
            "id": message_id,
            "role": "assistant",
            "toolCalls": [
                {"id": "call-1", "type": "function", "function": {"name": "pick_colour", "arguments": "{}"}}
            ],
        },
        {"id": "tool-1", "role": "tool", "toolCallId": "call-1", "content": "blue"},
    ]
    second = await _start(server, _body("t3", "r5", answered, tools=[PICK]))
    status = second.status_code
    body = await _drain(second) if status == 200 else json.loads(second.content)
    return {"toolRound": first, "probeParked": _answer(parked), "answerRound": {"status": status, "body": body}}


def _normalise(text: str) -> str:
    """Stable placeholders for the ids and times the server mints, in order of appearance."""
    seen: dict[str, str] = {}

    def stable(match: re.Match[str]) -> str:
        return seen.setdefault(match.group(0), f"id-{len(seen) + 1}")

    text = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", stable, text)
    text = re.sub(r'(\\?"timestamp\\?": ?)\d+', r"\g<1>0", text)
    return re.sub(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(\+00:00|Z)", "2026-01-01T00:00:00Z", text)


async def record() -> dict[str, Any]:
    return {
        "generator": "scripts/record_detached_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "agUiProtocol": version("ag-ui-protocol"),
        "canonicalized": ["uuid ids", "timestamps"],
        **(await _running_thread()),
        **(await _cancelled_thread()),
        **(await _second_turn()),
        **(await _client_tool_rounds()),
    }


if __name__ == "__main__":
    call_command("migrate", verbosity=0)
    recorded = asyncio.run(record())
    OUT.write_text(_normalise(json.dumps(recorded, indent=2)) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
