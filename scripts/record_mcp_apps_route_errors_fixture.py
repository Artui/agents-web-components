#!/usr/bin/env python
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

import django
from django.conf import settings

settings.configure(DEBUG=True, SECRET_KEY="x", ALLOWED_HOSTS=["*"], ROOT_URLCONF=__name__)
django.setup()

from django.test import RequestFactory  # noqa: E402
from django_ag_ui.agent.mcp_apps_view import MCPAppsView  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "mcp_apps_route_errors.json"


class _User:
    is_authenticated = True


class _Anonymous:
    is_authenticated = False


class _Throttle:
    def consume(self, request: Any) -> int:
        return 7


def _answer(view: MCPAppsView) -> dict[str, object]:
    request = RequestFactory().post("/mcp-apps/", data="{}", content_type="application/json")
    response = asyncio.run(view(request))
    return {"body": json.loads(response.content), "status": response.status_code}


def record() -> dict[str, dict[str, object]]:
    """The relay's refusals, as django-ag-ui's own view answers them."""
    anonymous = MCPAppsView(lambda: [], get_user=lambda request: _Anonymous())
    refused = MCPAppsView(
        lambda: [], get_user=lambda request: _User(), authorize=lambda request: False
    )
    throttled = MCPAppsView(
        lambda: [], get_user=lambda request: _User(), throttle=_Throttle()  # ty: ignore[invalid-argument-type]
    )
    return {"401": _answer(anonymous), "403": _answer(refused), "429": _answer(throttled)}


if __name__ == "__main__":
    OUT.write_text(json.dumps(record(), indent=2, sort_keys=True) + "\n")
    sys.stdout.write(f"wrote {OUT.name}\n")
