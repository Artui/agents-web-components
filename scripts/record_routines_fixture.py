#!/usr/bin/env python
"""Record django-ag-ui's routines editor answers into ``tests/fixtures/routines.json``.

Every body is written by the released ``RoutineEditorView``, mounted by ``AGUIServer`` over
a real routine model. Run it from the repository root::

    uv run --no-project --with 'django-ag-ui==0.88.1' --with django-service-specs \
        python scripts/record_routines_fixture.py
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from importlib.metadata import version
from pathlib import Path
from typing import Any

import django
from django.conf import settings

settings.configure(
    INSTALLED_APPS=["django.contrib.auth", "django.contrib.contenttypes"],
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
    SECRET_KEY="record",
    USE_TZ=True,
)
django.setup()

from django.contrib.auth.models import User  # noqa: E402
from django.core.management import call_command  # noqa: E402
from django.db import connection  # noqa: E402
from django.test import RequestFactory  # noqa: E402
from django_spec_agents.headless.types.firing_state import FiringState  # noqa: E402
from django_spec_agents.registry.decorator import tool  # noqa: E402
from django_spec_agents.registry.tool_registry import ToolRegistry  # noqa: E402
from django_spec_agents.routines import (  # noqa: E402
    AbstractRoutine,
    RoutinePolicy,
    RoutineSweep,
)
from pydantic_ai.models.function import FunctionModel  # noqa: E402

from django_ag_ui import AGUIServer  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "routines.json"
WEEKDAYS_AT_8 = {"kind": "weekly", "weekdays": [0, 1, 2, 3, 4], "at": "08:00"}


class Queue:
    def __init__(self) -> None:
        self.states: dict[str, FiringState] = {}

    def enqueue(self, spec_name: str, params: Mapping[str, Any], *, actor: Any) -> str:
        run_id = f"run-{len(self.states) + 1}"
        self.states[run_id] = FiringState.PENDING
        return run_id

    def state(self, run_id: str | None) -> FiringState | None:
        return self.states.get(run_id or "")


QUEUE = Queue()


class Routine(AbstractRoutine):
    class Meta:
        app_label = "auth"

    @classmethod
    def routine_policy(cls) -> Policy:
        return Policy()

    @classmethod
    def routine_sweep(cls) -> RoutineSweep | None:
        return RoutineSweep(queue=QUEUE, spec_name="fire")

    @classmethod
    def thread_waits(cls, thread_id: str | None, principal: Any) -> bool:
        return False


class Policy(RoutinePolicy[Routine]):
    def visible(self, request: Any) -> Iterable[Routine]:
        return Routine.objects.order_by("pk")

    def can_write(self, request: Any, routine: Routine) -> bool:
        return True

    def can_run(self, principal: Any, routine: Routine) -> bool:
        return True

    def new_routine(self, request: Any) -> Routine:
        return Routine()


def registry() -> ToolRegistry:
    tools = ToolRegistry()

    @tool(tools)
    def look(query: str) -> str:
        return query

    @tool(tools, destructive=True)
    def drop_table(name: str) -> str:
        return name

    return tools


def main() -> None:
    call_command("migrate", verbosity=0)
    with connection.schema_editor() as editor:
        editor.create_model(Routine)
    user = User.objects.create(username="recorder")
    server = AGUIServer(
        registry(),
        model=FunctionModel(lambda messages, info: None),
        routine_model=Routine,
        id="helper",
        csrf_exempt=True,
    )
    patterns, _, _ = server.urls
    routes = {pattern.name: (pattern.callback, pattern.default_args) for pattern in patterns}
    factory = RequestFactory()

    def answer(name: str, method: str = "get", body: Any = None, **kwargs: Any) -> Any:
        view, defaults = routes[name]
        if method == "get":
            request = factory.get("/r/")
        else:
            request = getattr(factory, method)(
                "/r/", data=json.dumps(body), content_type="application/json"
            )
        request.user = user
        response = view(request, **defaults, **kwargs)
        return {"status": response.status_code, "body": json.loads(response.content)}

    draft = {
        "name": "standup",
        "prompt": "Run standup.",
        "schedule": WEEKDAYS_AT_8,
        "timezone": "Europe/Paris",
        "preapprovedTools": ["look"],
    }
    answers: dict[str, Any] = {"listEmpty": answer("routines")}
    answers["created"] = answer("routines", "post", draft)
    routine_id = answers["created"]["body"]["id"]
    answers["destructiveUnconfirmed"] = answer(
        "routines", "post", {**draft, "name": "cleanup", "preapprovedTools": ["drop_table"]}
    )
    answers["destructiveConfirmed"] = answer(
        "routines",
        "post",
        {
            **draft,
            "name": "cleanup",
            "schedule": {"kind": "interval", "every_hours": 6},
            "preapprovedTools": ["drop_table"],
            "confirmDestructive": ["drop_table"],
        },
    )
    answers["paused"] = answer("routine", "patch", {"enabled": False}, routine_id=routine_id)
    answers["resumed"] = answer("routine", "patch", {"enabled": True}, routine_id=routine_id)
    answers["runsNever"] = answer("routine_runs", routine_id=routine_id)
    answers["ranNow"] = answer("routine_run", "post", {}, routine_id=routine_id)
    answers["runsPending"] = answer("routine_runs", routine_id=routine_id)
    answers["busy"] = answer("routine_run", "post", {}, routine_id=routine_id)
    QUEUE.states["run-1"] = FiringState.FINISHED
    answers["runsFinished"] = answer("routine_runs", routine_id=routine_id)
    answers["list"] = answer("routines")
    answers["badSchedule"] = answer(
        "routines", "post", {**draft, "schedule": {"kind": "weekly", "weekdays": []}}
    )
    record = {
        "recordedBy": "record_routines_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "answers": answers,
    }
    OUT.write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()
