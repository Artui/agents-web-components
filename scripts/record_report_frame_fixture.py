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
from pydantic_ai import Agent, RunContext
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    TextContent,
    TextPart,
    ToolReturnPart,
    UserPromptPart,
)
from pydantic_ai.models.function import DeltaToolCall, FunctionModel

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "report_frame.json"


def _marks() -> tuple[Any, Any, Any]:
    from django_spec_agents.child_sessions.report_frame import report_frame
    from django_spec_agents.child_sessions.types.message_origin import MessageOrigin
    from django_spec_agents.child_sessions.types.message_origin_key import MESSAGE_ORIGIN_KEY
    from django_spec_agents.child_sessions.types.message_task_key import MESSAGE_TASK_KEY
    from django_spec_agents.persistence.types.thread_ref import ThreadRef

    child = ThreadRef("child-1", "helper")
    report = report_frame(child, agent_id="helper", output="all done")
    question = UserPromptPart(
        [
            TextContent(
                "<task_question>which one?</task_question>",
                metadata={
                    MESSAGE_ORIGIN_KEY: MessageOrigin.TASK_QUESTION.value,
                    MESSAGE_TASK_KEY: {
                        "taskId": "child-1",
                        "threadId": "child-1",
                        "agentName": "helper",
                        "questionId": "q1",
                        "body": "which one?",
                    },
                },
            )
        ]
    )
    wake = UserPromptPart(
        [
            TextContent(
                "messages are waiting",
                metadata={MESSAGE_ORIGIN_KEY: MessageOrigin.WAKE.value},
            )
        ]
    )
    return report, question, wake


def _nudging_agent() -> Agent[None, Any]:
    report, question, _ = _marks()

    async def stream_fn(messages: list, info: Any) -> Any:
        if any(isinstance(p, ToolReturnPart) for m in messages for p in m.parts):
            yield "noted"
            return
        yield {0: DeltaToolCall(name="nudge", json_args="{}", tool_call_id="c1")}

    agent: Agent[None, Any] = Agent(FunctionModel(stream_function=stream_fn))

    @agent.tool
    def nudge(ctx: RunContext[Any]) -> str:
        ctx.enqueue(report, question, "the user's own words")
        return "ok"

    return agent


class _Store:
    def __init__(self) -> None:
        self.saved: list[Any] = []

    async def save(self, conversation: Any, *, request: Any) -> None:
        self.saved.append(conversation)

    async def load(self, thread_id: str, *, request: Any) -> Any:
        return None


def _canonical(sse: str, stored: str) -> tuple[str, str]:
    ids = re.findall(r'"(?:messageId|id)": ?"([^"]+)"', sse + stored)
    named = {
        old: f"m{n}" for n, old in enumerate(dict.fromkeys(i for i in ids if i != "u1"))
    }
    for old, new in named.items():
        sse, stored = sse.replace(old, new), stored.replace(old, new)
    return re.sub(r'"timestamp":\d+,', "", sse), stored


async def _delivered() -> dict[str, Any]:
    """A run that took in a report, a question and a user's line while it worked."""
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
        _nudging_agent(),
        AGUIAdapter.build_run_input(json.dumps(body).encode()),
        RequestFactory().post("/agent/"),
        deps=AgentDeps(user=None),
        audit_logger=NullAuditLogger(),
        config=build_ag_ui_config(),
        conversation_store=store,
    )
    sse = "".join([chunk async for chunk in session.stream()])
    sse, stored = _canonical(sse, json.dumps(store.saved[0].messages[1:]))
    return {"sse": sse, "stored": json.loads(stored)}


def _replayed() -> list[Any]:
    """A woken thread's server-held history, as the thread endpoint replays it."""
    from django_ag_ui.agent.outcome_agui_adapter import OutcomeAGUIAdapter

    report, question, wake = _marks()
    history = [
        ModelRequest(parts=[wake]),
        ModelResponse(parts=[TextPart(content="checking in")], model_name="m"),
        ModelRequest(parts=[report, question]),
        ModelResponse(parts=[TextPart(content="the helper is done")], model_name="m"),
    ]
    dumped = [
        m.model_dump(mode="json", by_alias=True, exclude_none=True)
        for m in OutcomeAGUIAdapter.dump_messages(history)
    ]
    _, stored = _canonical("", json.dumps(dumped))
    return json.loads(stored)


def record() -> dict[str, Any]:
    """A child's report and question, delivered live and replayed from server-held history."""
    settings.configure(
        SECRET_KEY="record",
        INSTALLED_APPS=["django.contrib.contenttypes", "django.contrib.auth"],
        DATABASES={
            "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}
        },
    )
    django.setup()
    return {
        "generator": "scripts/record_report_frame_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "djangoSpecAgents": version("django-spec-agents"),
        "pydanticAi": version("pydantic-ai-slim"),
        "canonicalized": ["messageId", "id", "timestamp"],
        "delivered": asyncio.run(_delivered()),
        "replayed": _replayed(),
    }


if __name__ == "__main__":
    OUT.write_text(json.dumps(record(), indent=2, ensure_ascii=False) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
