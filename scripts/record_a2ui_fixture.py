#!/usr/bin/env python
"""Record what django-ag-ui does with A2UI into ``tests/fixtures/a2ui_server.json``.

Two things, both written by the server package's own code: the surface
snapshot its ``render_a2ui`` tool returns for a catalog this renderer posts,
and the user turn ``with_a2ui_action`` builds from an action this renderer
sends. Nothing here types a server payload by hand.

Run it with the released server, from the repository root::

    uv run --no-project --with 'django-ag-ui[a2ui]==0.78.0' python scripts/record_a2ui_fixture.py
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

import django
from django.conf import settings

settings.configure()
django.setup()

from ag_ui.core import Context, RunAgentInput  # noqa: E402

from django_ag_ui.agent.build_a2ui_toolset import build_a2ui_toolset  # noqa: E402
from django_ag_ui.agent.with_a2ui_action import with_a2ui_action  # noqa: E402
from django_ag_ui.constants import A2UI_SCHEMA_CONTEXT_DESCRIPTION  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CATALOG = (ROOT / "a2ui" / "v1" / "catalog.json").read_text()

COMPONENTS = [
    {"id": "root", "component": "Column", "children": ["title", "items", "name", "agree", "go"]},
    {"id": "title", "component": "Text", "text": {"@path": "/title"}, "variant": "body"},
    {"id": "items", "component": "List", "children": {"componentId": "item", "path": "/items"}},
    {"id": "item", "component": "Text", "text": {"@path": "label"}},
    {
        "id": "name",
        "component": "TextField",
        "label": "Name",
        "value": {"@path": "/form/name"},
        "@checks": [
            {
                "condition": {"@call": "required", "args": {"value": {"@path": "/form/name"}}},
                "message": "A name is required.",
            }
        ],
    },
    {"id": "agree", "component": "CheckBox", "label": "Agree", "value": {"@path": "/form/agree"}},
    {"id": "go-label", "component": "Text", "text": "Send"},
    {
        "id": "go",
        "component": "Button",
        "child": "go-label",
        "variant": "primary",
        "action": {
            "event": {
                "name": "submit",
                "userMessage": {"@path": "/form/name"},
                "context": {"name": {"@path": "/form/name"}},
            }
        },
    },
]
DATA = {"title": "Hello", "items": [{"label": "one"}, {"label": "two"}], "form": {"name": "Ada"}}

ACTIONS = [
    {
        "name": "submit",
        "surfaceId": "s1",
        "sourceComponentId": "go",
        "timestamp": "2026-11-16T10:00:00.000Z",
        "userMessage": "Ada",
        "context": {"name": "Ada", "count": 2, "ratio": 0.5, "ok": True, "none": None},
    },
    {
        "name": "pick",
        "surfaceId": "s1",
        "sourceComponentId": "go",
        "timestamp": "2026-11-16T10:00:00.000Z",
        "context": {"place": "Zürich — “quoted”", "nested": {"list": [1, "two"]}},
    },
]


def run_input(**overrides: object) -> RunAgentInput:
    fields: dict[str, object] = {
        "thread_id": "thread-1",
        "run_id": "run-1",
        "state": None,
        "messages": [],
        "tools": [],
        "context": [Context(description=A2UI_SCHEMA_CONTEXT_DESCRIPTION, value=CATALOG)],
        "forwarded_props": {},
    }
    fields.update(overrides)
    return RunAgentInput(**fields)


async def surface() -> dict[str, object]:
    toolset = build_a2ui_toolset(run_input())
    assert toolset is not None, "the server did not accept the posted catalog"
    tool = toolset.tools["render_a2ui"]
    ctx = SimpleNamespace(tool_call_id="call-1")
    result = await tool.function(ctx, surfaceId="s1", components=COMPONENTS, data=DATA)
    (event,) = result.metadata
    return event.model_dump(mode="json", by_alias=True, exclude_none=True)


def action_turn(action: dict[str, object], run_id: str) -> dict[str, object]:
    props = {"a2uiAction": {"userAction": action}}
    out = with_a2ui_action(run_input(run_id=run_id, forwarded_props=props))
    turn = out.messages[-1]
    return {"runId": run_id, "userAction": action, "id": turn.id, "content": turn.content}


def main() -> None:
    fixture = {
        "contextDescription": A2UI_SCHEMA_CONTEXT_DESCRIPTION,
        "surface": asyncio.run(surface()),
        "actions": [
            action_turn(action, run_id)
            for action, run_id in zip(ACTIONS, ["run-1", "3f2c1d1e-7a7b-4c4d-8e8f-909192939495"])
        ],
    }
    path = ROOT / "tests" / "fixtures" / "a2ui_server.json"
    path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n")


main()
