#!/usr/bin/env python
from __future__ import annotations

import asyncio
import json
import re
import sys
import tempfile
import uuid
from collections.abc import Mapping
from importlib.metadata import version
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import django
from django.conf import settings

RUN = "uv run --no-project --with 'django-ag-ui==0.84.0' --with django-service-specs --with 'django-spec-agents[harness]' python scripts/record_queued_start_fixture.py"  # noqa: E501

DB = Path(tempfile.mkdtemp()) / "queued.sqlite3"
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
from django_service_specs import Unrestricted, adispatch, check_call  # noqa: E402
from django_spec_agents.contrib.store.default_conversation_store import (  # noqa: E402
    DefaultConversationStore,
)
from django_spec_agents.contrib.store.default_run_store import DefaultRunStore  # noqa: E402
from django_spec_agents.contrib.store.default_step_store import DefaultStepStore  # noqa: E402
from django_spec_agents.headless.run_headless import run_headless  # noqa: E402
from django_spec_agents.registry.tool_registry import ToolRegistry  # noqa: E402
from pydantic_ai.models.function import AgentInfo, FunctionModel  # noqa: E402

from django_ag_ui.agent.agui_server import AGUIServer  # noqa: E402
from django_ag_ui.agent.headless_runner import AGUIHeadlessRunner  # noqa: E402
from django_ag_ui.config.build_ag_ui_config import build_ag_ui_config  # noqa: E402

OUT = (
    Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "queued_start.json"
)
SSE = {"Accept": "text/event-stream"}
OWNER = SimpleNamespace(is_authenticated=True, pk=1, username="owner")


class _Factory(AsyncRequestFactory):
    """Every request carries the logged-in owner the run store scopes threads to."""

    def request(self, **request: Any) -> Any:
        built = super().request(**request)
        built.user = OWNER
        return built


class _Worker:
    """A FiringQueue that keeps each enqueued call until ``work`` runs it, as a worker would."""

    def __init__(self) -> None:
        self.spec: Any = None
        self.enqueued: list[tuple[Mapping[str, Any], Any]] = []

    def enqueue(self, spec_name: str, params: Mapping[str, Any], *, actor: Any) -> str:
        check_call(self.spec, principal=actor, arguments=params)
        self.enqueued.append((params, actor))
        return uuid.uuid4().hex

    def state(self, run_id: str) -> None:
        return None

    async def work(self) -> None:
        for params, actor in self.enqueued:
            await adispatch(self.spec, principal=actor, arguments=params)
        self.enqueued.clear()


def _model() -> FunctionModel:
    async def stream_fn(messages: list, info: AgentInfo) -> Any:
        yield "queued answer"

    return FunctionModel(stream_function=stream_fn)


def _server(worker: _Worker) -> AGUIServer:
    server = AGUIServer(
        ToolRegistry(),
        model=_model(),
        csrf_exempt=True,
        conversation_store=DefaultConversationStore(),
        step_store=DefaultStepStore,
        run_store=DefaultRunStore(),
        config=build_ag_ui_config(heartbeat_seconds=0, run_timeout_seconds=300),
        id="browser",
        firing_queue=worker,
    )
    worker.spec = run_headless(AGUIHeadlessRunner(server), permissions=[Unrestricted()])
    return server


def _route(server: AGUIServer, name: str) -> Any:
    patterns, _, _ = server.urls
    return next(p for p in patterns if p.name == name).callback


def _body(thread_id: str, run_id: str) -> bytes:
    return json.dumps(
        {
            "threadId": thread_id,
            "runId": run_id,
            "state": {},
            "messages": [
                {"id": f"u-{run_id}", "role": "user", "content": "Queue this one"}
            ],
            "tools": [],
            "context": [],
            "forwardedProps": {"detach": True},
        }
    ).encode()


async def _drain(stream: Any) -> str:
    return await asyncio.wait_for(_read_all(stream), 20)


async def _read_all(stream: Any) -> str:
    return "".join([c if isinstance(c, str) else c.decode() async for c in stream])


async def record() -> dict[str, Any]:
    worker = _Worker()
    server = _server(worker)
    request = _Factory().post(
        "/agent/", data=_body("t1", "r1"), content_type="application/json"
    )
    start = await _route(server, "endpoint")(request)
    replay_request = _Factory().get("/agent/threads/t1/events/?after=0", headers=SSE)
    replay = await _route(server, "thread_events")(replay_request, thread_id="t1")
    reading = asyncio.ensure_future(_drain(replay.streaming_content))
    await asyncio.sleep(0.05)
    await worker.work()
    return {
        "generator": "scripts/record_queued_start_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "agUiProtocol": version("ag-ui-protocol"),
        "canonicalized": ["uuid ids", "timestamps"],
        "queuedStart": {
            "status": start.status_code,
            "contentType": start["Content-Type"],
            "body": json.loads(start.content),
        },
        "queuedReplay": await reading,
    }


def _normalise(text: str) -> str:
    """Stable placeholders for the ids and times the server mints, in order of appearance."""
    seen: dict[str, str] = {}

    def stable(match: re.Match[str]) -> str:
        return seen.setdefault(match.group(0), f"id-{len(seen) + 1}")

    text = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", stable, text
    )
    text = re.sub(r'(\\?"timestamp\\?": ?)\d+', r"\g<1>0", text)
    return re.sub(
        r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(\+00:00|Z)",
        "2026-01-01T00:00:00Z",
        text,
    )


if __name__ == "__main__":
    call_command("migrate", verbosity=0)
    recorded = asyncio.run(record())
    OUT.write_text(_normalise(json.dumps(recorded, indent=2)) + "\n")
    sys.stdout.write(f"wrote {OUT.name}; regenerate with: {RUN}\n")
