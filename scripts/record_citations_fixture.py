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
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.messages import (
    Citation,
    CompactionPart,
    ContentCitationAnchor,
    DocumentCitationSource,
    FilePart,
    MarkerCitationAnchor,
    TextPart,
    ThinkingPart,
    WebCitationSource,
)
from pydantic_ai.models import function as function_module
from pydantic_ai.models.function import FunctionModel

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "citations.json"
ASTRAL = "\U0001d400"
SKY = WebCitationSource(
    url="https://example.com/sky", title="Sky", excerpts=["The sky is blue."]
)
DOC = DocumentCitationSource(document_id="doc-7", title="Field notes", excerpts=[])


def _cited(content: str, phrase: str, source: Any = SKY) -> TextPart:
    start = content.index(phrase)
    anchor = ContentCitationAnchor(start=start, end=start + len(phrase))
    return TextPart(
        content=content, citations=[Citation(sources=[source], anchor=anchor)]
    )


RUNS: dict[str, list[Any]] = {
    "cited": [
        TextPart(content=f"{ASTRAL} sky: "),
        TextPart(
            content="it is blue [1]",
            citations=[
                Citation(sources=[SKY], anchor=ContentCitationAnchor(start=6, end=10)),
                Citation(sources=[DOC], anchor=MarkerCitationAnchor(start=11, end=14)),
                Citation(sources=[SKY, DOC]),
            ],
        ),
    ],
    "fileSplit": [
        _cited("B is", "is"),
        FilePart(content=BinaryContent(data=b"png", media_type="image/png")),
        _cited("C too", "too", DOC),
    ],
    "compactionSplit": [
        _cited("before it", "it"),
        CompactionPart(
            provider_name="openai", provider_details={"encrypted_content": "x"}
        ),
        TextPart(content="after"),
    ],
    "reasoningSplit": [
        _cited("first part", "part"),
        ThinkingPart(content="pondering"),
        TextPart(content="second"),
    ],
}


def _whole_parts() -> None:
    """Stream each scripted part whole, as the producer's own tests do."""
    original = function_module.FunctionStreamedResponse._get_event_iterator

    async def _one(item: Any) -> Any:
        yield item

    async def _iterator(self: Any) -> Any:
        async for item in self._iter:
            if isinstance(item, TextPart | FilePart | ThinkingPart | CompactionPart):
                yield self._parts_manager.handle_part(vendor_part_id=None, part=item)
            else:
                self._iter = _one(item)
                async for event in original(self):
                    yield event

    function_module.FunctionStreamedResponse._get_event_iterator = _iterator


class _Store:
    def __init__(self) -> None:
        self.saved: list[Any] = []

    async def save(self, conversation: Any, *, request: Any) -> None:
        self.saved.append(conversation)

    async def load(self, thread_id: str, *, request: Any) -> Any:
        return None


async def _record(parts: list[Any]) -> dict[str, Any]:
    """One run's SSE body and the messages its store saved, through the real session."""
    from django.test import RequestFactory
    from django_ag_ui.agent.agent_session import AgentSession
    from django_ag_ui.config.build_ag_ui_config import build_ag_ui_config
    from django_spec_agents.agent.types.agent_deps import AgentDeps
    from django_spec_agents.policy.audit.null_audit_logger import NullAuditLogger
    from pydantic_ai.ui.ag_ui import AGUIAdapter

    async def stream_fn(messages: list, info: Any) -> Any:
        for part in parts:
            yield part

    agent: Agent[None, Any] = Agent(FunctionModel(stream_function=stream_fn))
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
    """Each run as django-ag-ui streams it live and stores it for the thread endpoint."""
    settings.configure(
        SECRET_KEY="record",
        INSTALLED_APPS=["django.contrib.contenttypes", "django.contrib.auth"],
        DATABASES={
            "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
        },
    )
    django.setup()
    _whole_parts()
    return {
        "generator": "scripts/record_citations_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "pydanticAi": version("pydantic-ai-slim"),
        "agUiProtocol": version("ag-ui-protocol"),
        "canonicalized": ["messageId", "id", "timestamp"],
        "runs": {name: asyncio.run(_record(parts)) for name, parts in RUNS.items()},
    }


if __name__ == "__main__":
    OUT.write_text(json.dumps(record(), indent=2, ensure_ascii=False) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
