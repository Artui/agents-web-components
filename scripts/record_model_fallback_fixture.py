#!/usr/bin/env python
from __future__ import annotations

import asyncio
import json
import re
import sys
from importlib.metadata import version
from pathlib import Path
from typing import Any

import django
from django.conf import settings
from pydantic_ai import Agent
from pydantic_ai.capabilities import ModelFallback
from pydantic_ai.exceptions import ModelAPIError
from pydantic_ai.models.function import FunctionModel

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "model_fallback.json"


async def primary(messages: list, info: Any) -> Any:
    yield "from the primary"


async def broken(messages: list, info: Any) -> Any:
    raise ModelAPIError(model_name="broken", message="down")
    yield ""  # pragma: no cover


async def spare(messages: list, info: Any) -> Any:
    yield "from the spare"


def _agents() -> dict[str, Agent[None, Any]]:
    return {
        "primary": Agent(FunctionModel(stream_function=primary)),
        "fallback": Agent(
            FunctionModel(stream_function=broken),
            capabilities=[ModelFallback(FunctionModel(stream_function=spare))],
        ),
    }


class _Store:
    def __init__(self) -> None:
        self.saved: list[Any] = []

    async def save(self, conversation: Any, *, request: Any) -> None:
        self.saved.append(conversation)

    async def load(self, thread_id: str, *, request: Any) -> Any:
        return None


async def _record(agent: Agent[None, Any]) -> dict[str, Any]:
    """One run's SSE body and the messages its store saved, through the real session."""
    from django.test import RequestFactory
    from django_ag_ui.agent.agent_session import AgentSession
    from django_ag_ui.config.build_ag_ui_config import build_ag_ui_config
    from django_spec_agents.agent.types.agent_deps import AgentDeps
    from django_spec_agents.policy.audit.null_audit_logger import NullAuditLogger
    from pydantic_ai.ui.ag_ui import AGUIAdapter

    body = {"threadId": "t1", "runId": "r1", "tools": [], "context": [], "state": None}
    body |= {
        "messages": [{"id": "u1", "role": "user", "content": "hi"}],
        "forwardedProps": None,
    }
    store = _Store()
    session = AgentSession(
        agent,
        AGUIAdapter.build_run_input(json.dumps(body).encode()),
        RequestFactory().post("/agent/"),
        deps=AgentDeps(user=None),
        audit_logger=NullAuditLogger(),
        config=build_ag_ui_config(),
        conversation_store=store,
    )
    sse = "".join([chunk async for chunk in session.stream()])
    stored = json.dumps(store.saved[0].messages[1:])
    ids = re.findall(r'"(?:messageId|id)": ?"([^"]+)"', sse + stored)
    named = {
        old: f"m{n}" for n, old in enumerate(dict.fromkeys(i for i in ids if i != "u1"))
    }
    for old, new in named.items():
        sse, stored = sse.replace(old, new), stored.replace(old, new)
    sse = re.sub(r'"timestamp":\d+,', "", sse)
    return {"sse": sse, "stored": json.loads(stored)}


def record() -> dict[str, Any]:
    """A first-model answer and a fallback answer, as django-ag-ui streams and stores each."""
    settings.configure(
        SECRET_KEY="record",
        INSTALLED_APPS=["django.contrib.contenttypes", "django.contrib.auth"],
        DATABASES={
            "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
        },
    )
    django.setup()
    return {
        "generator": "scripts/record_model_fallback_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "pydanticAi": version("pydantic-ai-slim"),
        "agUiProtocol": version("ag-ui-protocol"),
        "canonicalized": ["messageId", "id", "timestamp"],
        "runs": {name: asyncio.run(_record(agent)) for name, agent in _agents().items()},
    }


if __name__ == "__main__":
    OUT.write_text(json.dumps(record(), indent=2, ensure_ascii=False) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
