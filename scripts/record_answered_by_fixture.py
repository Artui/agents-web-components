#!/usr/bin/env python
from __future__ import annotations

import json
import sys
from importlib.metadata import version
from pathlib import Path

from ag_ui.core import EventType, ToolCallResultEvent
from ag_ui.encoder import EventEncoder
from django_ag_ui.agent.outcome_agui_adapter import OutcomeAGUIAdapter
from django_ag_ui.agent.stamp_answered_by import stamp_answered_by
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    ToolCallPart,
    ToolReturnPart,
)

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "answered_by.json"
MARKS = {
    "reviewer": "reviewer:openai:gpt-5",
    "routine": "routine:42",
    "unknown": "oracle:x",
}


def _stored(mark: str) -> object:
    """The tool message the server stores, dumped by its own adapter, its random id fixed."""
    history = [
        ModelResponse(
            parts=[ToolCallPart(tool_name="book_flight", args={}, tool_call_id="tc1")]
        ),
        ModelRequest(
            parts=[
                ToolReturnPart(
                    tool_name="book_flight",
                    content="ok",
                    tool_call_id="tc1",
                    metadata={"answered_by": mark},
                )
            ]
        ),
    ]
    tool = OutcomeAGUIAdapter.dump_messages(history)[-1]
    return {
        **tool.model_dump(mode="json", by_alias=True, exclude_none=True),
        "id": "t1",
    }


def record() -> dict[str, object]:
    """Each mark as django-ag-ui stamps it: an SSE frame live, a stored tool message on reload."""
    encoder = EventEncoder()
    frames: dict[str, str] = {}
    messages: dict[str, object] = {}
    for key, mark in MARKS.items():
        event = ToolCallResultEvent(
            type=EventType.TOOL_CALL_RESULT,
            message_id="m1",
            tool_call_id="tc1",
            content="ok",
        )
        frames[key] = encoder.encode(stamp_answered_by(event, mark))
        messages[key] = _stored(mark)
    return {
        "generator": "scripts/record_answered_by_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "agUiProtocol": version("ag-ui-protocol"),
        "canonicalized": ["id"],
        "frames": frames,
        "messages": messages,
    }


if __name__ == "__main__":
    OUT.write_text(json.dumps(record(), indent=2) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
