#!/usr/bin/env python
"""Record django-ag-ui's thread-status routes into ``tests/fixtures/thread_status.json``.

Every body here is what a real ``AGUIServer`` mount with a run store answers:
``threads/`` with each row's ``status``, ``last_read_at`` and ``interrupts``,
its ``ETag`` and the ``304`` a matching ``If-None-Match`` gets, one SSE frame of
the same body, the JSON a non-ASGI request gets for ``Accept: text/event-stream``,
``threads/<id>/read/``, and the run a resumed approval starts. Nothing is typed
by hand; the script only chooses the thread ids, the prompts and the tools.

Driven through ``AsyncRequestFactory`` on one event loop, as
``record_detached_fixture.py`` is. Run it with the released server::

    uv run --no-project --with 'django-ag-ui==0.84.0' python scripts/record_thread_status_fixture.py

Ids the server mints are replaced by stable placeholders. Timestamps are
replaced by stable ones that keep their order, since the client compares
``last_read_at`` with ``updated_at``.
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

DB = Path(tempfile.mkdtemp()) / "status.sqlite3"
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
from django.test import AsyncRequestFactory, RequestFactory  # noqa: E402
from django_spec_agents.contrib.store.default_conversation_store import (  # noqa: E402
    DefaultConversationStore,
)
from django_spec_agents.contrib.store.default_run_store import DefaultRunStore  # noqa: E402
from django_spec_agents.persistence.types.thread_run_status import (  # noqa: E402
    ThreadRunStatus,
)
from django_spec_agents.policy.guard.types.tool_guard_config import (  # noqa: E402
    ToolGuardConfig,
)
from pydantic_ai.exceptions import CallDeferred  # noqa: E402
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel  # noqa: E402

from django_ag_ui import ToolRegistry, tool  # noqa: E402
from django_ag_ui.agent.agui_server import AGUIServer  # noqa: E402
from django_ag_ui.config.build_ag_ui_config import build_ag_ui_config  # noqa: E402
from django_ag_ui.persistence import threads_view as threads_view_module  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "thread_status.json"
SSE = {"Accept": "text/event-stream"}
USER = SimpleNamespace(is_authenticated=True, pk=1, username="owner")


class _Factory(AsyncRequestFactory):
    """Every request carries the logged-in owner the stores scope threads to."""

    def request(self, **request: Any) -> Any:
        built = super().request(**request)
        built.user = USER
        return built


class _SyncFactory(RequestFactory):
    """The same owner on a WSGI request, which answers a stream request as a poll."""

    def request(self, **request: Any) -> Any:
        built = super().request(**request)
        built.user = USER
        return built


class _Gate:
    """Answers by the prompt: a tool to call, a failure, or text once released."""

    def __init__(self) -> None:
        self.release = asyncio.Event()
        self.release.set()

    def model(self) -> FunctionModel:
        async def stream_fn(messages: list, info: AgentInfo) -> Any:
            parts = [p for m in messages for p in getattr(m, "parts", [])]
            if any(getattr(p, "part_kind", "") == "tool-return" for p in parts):
                yield "Deleted."
                return
            prompt = next(
                (p.content for p in reversed(parts) if getattr(p, "part_kind", "") == "user-prompt"),
                "",
            )
            if "delete" in prompt:
                args = '{"target": "invoice-7"}'
                yield {0: DeltaToolCall(name="delete_invoice", json_args=args, tool_call_id="call-1")}
                return
            if "ask" in prompt:
                yield {0: DeltaToolCall(name="ask", json_args='{"topic": "colour"}', tool_call_id="call-2")}
                return
            if "fail" in prompt:
                raise RuntimeError("the model broke")
            yield "partial answer"
            await self.release.wait()
            yield " and the rest"

        return FunctionModel(stream_function=stream_fn)


def _server(gate: _Gate, **kwargs: Any) -> AGUIServer:
    registry = ToolRegistry()

    @tool(registry, destructive=True)
    def delete_invoice(target: str) -> str:
        """Delete an invoice."""
        return f"deleted {target}"

    @tool(registry)
    def ask(topic: str) -> str:
        """Ask the person a question."""
        raise CallDeferred(kind="question")

    return AGUIServer(
        registry,
        model=gate.model(),
        csrf_exempt=True,
        conversation_store=DefaultConversationStore(),
        run_store=DefaultRunStore(),
        config=build_ag_ui_config(
            heartbeat_seconds=0, run_timeout_seconds=300, tool_guard=ToolGuardConfig(enabled=True)
        ),
        **kwargs,
    )


def _route(server: AGUIServer, name: str) -> Any:
    patterns, _, _ = server.urls
    return next(p for p in patterns if p.name == name).callback


def _body(thread_id: str, run_id: str, messages: list[dict[str, Any]], **extra: Any) -> bytes:
    payload = {
        "threadId": thread_id,
        "runId": run_id,
        "state": {},
        "messages": messages,
        "tools": [],
        "context": [],
        "forwardedProps": {"detach": True},
    }
    return json.dumps({**payload, **extra}).encode()


def _user(run_id: str, content: str) -> dict[str, Any]:
    return {"id": f"u-{run_id}", "role": "user", "content": content}


async def _start(server: AGUIServer, body: bytes) -> Any:
    request = _Factory().post("/agent/", data=body, content_type="application/json")
    return await _route(server, "endpoint")(request)


async def _drain(response: Any) -> str:
    async def read() -> str:
        return "".join([c if isinstance(c, str) else c.decode() async for c in response.streaming_content])

    return await asyncio.wait_for(read(), 20)


async def _until(response: Any, needle: str) -> str:
    seen = ""
    async for chunk in response.streaming_content:
        seen += chunk if isinstance(chunk, str) else chunk.decode()
        if needle in seen:
            await response.streaming_content.aclose()
            return seen
    raise AssertionError(f"never saw {needle!r}")


async def _settled(thread_id: str) -> None:
    request = _Factory().get("/")
    for _ in range(500):
        state = await DefaultRunStore().get(thread_id, request=request)
        if state is not None and state.status is not ThreadRunStatus.RUNNING:
            return
        await asyncio.sleep(0.01)
    raise AssertionError("the run never settled")


async def _list(server: AGUIServer, **headers: str) -> Any:
    return await _route(server, "threads")(_Factory().get("/agent/threads/", headers=headers))


async def _read(server: AGUIServer, thread_id: str) -> Any:
    request = _Factory().post(f"/agent/threads/{thread_id}/read/")
    return await _route(server, "thread_read")(request, thread_id=thread_id)


def _answer(response: Any) -> dict[str, Any]:
    body = json.loads(response.content) if response.content else None
    return {"status": response.status_code, "etag": response.get("ETag"), "body": body}


def _row(response: Any, thread_id: str) -> dict[str, Any]:
    return next(r for r in json.loads(response.content)["threads"] if r["thread_id"] == thread_id)


async def _reads(server: AGUIServer, gate: _Gate) -> dict[str, Any]:
    """A turn seen to its end then read; a second turn left running; a thread no run claimed."""
    seen = await _drain(await _start(server, _body("t-read", "r1", [_user("r1", "Hello")])))
    await _settled("t-read")
    after_seen = _row(await _list(server), "t-read")
    read = await _read(server, "t-read")
    after_read = _row(await _list(server), "t-read")
    stored = await DefaultConversationStore().load("t-read", request=_Factory().get("/"))
    gate.release.clear()
    second = [*stored.messages, _user("r2", "And then?")]
    await _until(await _start(server, _body("t-read", "r2", second)), "partial answer")
    running = _row(await _list(server), "t-read")
    gate.release.set()
    await _settled("t-read")
    after_away = _row(await _list(server), "t-read")
    unknown = await _read(server, "t-never")
    return {
        "seenRun": seen,
        "rowAfterSeenRun": after_seen,
        "markRead": {"status": read.status_code},
        "rowAfterRead": after_read,
        "rowWhileRunning": running,
        "rowAfterRunAway": after_away,
        "markReadUnknown": _answer(unknown),
    }


async def _parked(server: AGUIServer) -> dict[str, Any]:
    """A destructive call parked for approval, a question, a failure; then the approval resumed."""
    asked = [_user("r3", "Please delete invoice 7")]
    parked_run = await _drain(await _start(server, _body("t-approve", "r3", asked)))
    await _settled("t-approve")
    await _drain(await _start(server, _body("t-question", "r4", [_user("r4", "Please ask me")])))
    await _settled("t-question")
    await _drain(await _start(server, _body("t-failed", "r5", [_user("r5", "Please fail")])))
    await _settled("t-failed")
    listed = await _list(server)
    etag = listed["ETag"]
    unchanged = await _list(server, **{"If-None-Match": etag})
    stored = await DefaultConversationStore().load("t-approve", request=_Factory().get("/"))
    [interrupt] = _row(listed, "t-approve")["interrupts"]
    resume = [{"interruptId": interrupt["id"], "status": "resolved", "payload": {"approved": True}}]
    resumed = await _start(server, _body("t-approve", "r6", stored.messages, resume=resume))
    resumed_run = await _drain(resumed)
    await _settled("t-approve")
    changed = await _list(server, **{"If-None-Match": etag})
    return {
        "parkedApprovalRun": parked_run,
        "listed": _answer(listed),
        "notModified": _answer(unchanged),
        "approvalHistory": stored.messages,
        "resumeSent": resume,
        "resumedRun": {"status": resumed.status_code, "body": resumed_run},
        "listedAfterResume": _answer(changed),
    }


async def _streams(server: AGUIServer) -> dict[str, Any]:
    """One SSE frame of the list, the same frame skipped by its ETag, and WSGI's poll answer."""
    threads_view_module._STREAM_POLL_SECONDS = 0.05
    stream = await _list(server, **SSE)
    frame = await _until(stream, "\n\n")
    etag = frame.split("\n", 1)[0].removeprefix("id: ")
    skipped = await _list(server, **SSE, **{"Last-Event-ID": etag})
    try:
        first_after_skip: str | None = await asyncio.wait_for(_first_chunk(skipped), 0.5)
    except TimeoutError:
        first_after_skip = None
    wsgi = await _route(server, "threads")(_SyncFactory().get("/agent/threads/", headers=SSE))
    return {
        "streamContentType": stream["Content-Type"],
        "streamFrame": frame,
        "streamSkipped": first_after_skip,
        "wsgiStreamRequest": {**_answer(wsgi), "contentType": wsgi["Content-Type"]},
    }


async def _first_chunk(response: Any) -> str:
    async for chunk in response.streaming_content:
        return chunk if isinstance(chunk, str) else chunk.decode()
    return ""


def _normalise(text: str) -> str:
    """Stable ids in order of appearance; timestamps stable and in their own order."""
    seen: dict[str, str] = {}

    def stable(match: re.Match[str]) -> str:
        return seen.setdefault(match.group(0), f"id-{len(seen) + 1}")

    text = re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", stable, text)
    text = re.sub(r'(\\?"timestamp\\?": ?)\d+', r"\g<1>0", text)
    stamp = r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:\+00:00|Z)"
    ordered = sorted(set(re.findall(stamp, text)))
    times = {t: f"2026-01-01T00:{i // 60:02d}:{i % 60:02d}.000000+00:00" for i, t in enumerate(ordered)}
    text = re.sub(stamp, lambda m: times[m.group(0)], text)
    # The ETag hashes the body, so it is renamed after the body's own values are.
    etags: dict[str, str] = {}
    return re.sub(r'W?/?\\?"[0-9a-f]{32,64}\\?"', lambda m: etags.setdefault(m.group(0), f'\\"etag-{len(etags) + 1}\\"'), text)


async def record() -> dict[str, Any]:
    gate = _Gate()
    server = _server(gate, id="helper", name="Helper", description="Answers questions.")
    return {
        "generator": "scripts/record_thread_status_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "agUiProtocol": version("ag-ui-protocol"),
        "canonicalized": ["uuid ids", "timestamps, order kept", "etags"],
        **(await _reads(server, gate)),
        **(await _parked(server)),
        **(await _streams(server)),
    }


if __name__ == "__main__":
    call_command("migrate", verbosity=0)
    recorded = asyncio.run(record())
    OUT.write_text(_normalise(json.dumps(recorded, indent=2)) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
