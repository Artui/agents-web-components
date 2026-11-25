#!/usr/bin/env python
"""Record django-ag-ui's skill editor answers into ``tests/fixtures/skill_editor.json``.

Every body is written by the released ``SkillEditorView`` over a real model, and the
skills-changed event by ``skills_changed``. Run it from the repository root::

    uv run --no-project --with 'django-ag-ui==0.91.0' python scripts/record_skill_editor_fixture.py
"""

from __future__ import annotations

import json
from importlib.metadata import version
from pathlib import Path

import django
from django.conf import settings

settings.configure(
    INSTALLED_APPS=["django.contrib.auth", "django.contrib.contenttypes"],
    DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
    SECRET_KEY="record",
    USE_TZ=True,
)
django.setup()

from django.contrib.auth.models import AnonymousUser, User  # noqa: E402
from django.core.management import call_command  # noqa: E402
from django.db import connection  # noqa: E402
from django.test import RequestFactory  # noqa: E402
from django_spec_agents.skills import AbstractSkill  # noqa: E402
from django_spec_agents.skills.types.max_visible_skills import MAX_VISIBLE_SKILLS  # noqa: E402

from django_ag_ui.skills.skill_editor_view import SkillEditorView  # noqa: E402
from django_ag_ui.skills.skills_changed import skills_changed  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "skill_editor.json"


class Skill(AbstractSkill):
    class Meta:
        app_label = "auth"


class Policy:
    refuse = False

    def visible(self, request):
        return Skill.objects.order_by("pk")

    def can_write(self, request, skill):
        return not self.refuse

    def new_skill(self, request):
        return Skill()


class ScopedPolicy(Policy):
    def scope(self, request, skill):
        return {"weekly-report": "personal", "team-handbook": "shared"}.get(skill.name)


def main() -> None:
    call_command("migrate", verbosity=0)
    with connection.schema_editor() as editor:
        editor.create_model(Skill)
    user = User.objects.create(username="recorder")
    policy = Policy()
    view = SkillEditorView(policy, csrf_exempt=True)
    factory = RequestFactory()

    def answer(method, body=None, *, skill_id=None, anonymous=False, raw=None, ctype=None):
        path = "/skills/editor/" if skill_id is None else f"/skills/editor/{skill_id}/"
        data = raw if raw is not None else json.dumps(body)
        if method == "get":
            request = factory.get(path)
        else:
            request = getattr(factory, method)(
                path, data=data, content_type=ctype or "application/json"
            )
        request.user = AnonymousUser() if anonymous else user
        response = view(request, skill_id)
        return {"status": response.status_code, "body": json.loads(response.content)}

    draft = {
        "name": "weekly-report",
        "description": "Summarise the week.",
        "body": "Collect the tickets.",
        "userInvocable": True,
        "modelInvocable": False,
    }
    answers = {"listEmpty": answer("get"), "created": answer("post", draft)}
    skill_id = answers["created"]["body"]["id"]
    answers["list"] = answer("get")
    edited = {**draft, "description": "Summarise the week per team."}
    answers["updated"] = answer("put", edited, skill_id=skill_id)
    answers["disabled"] = answer("patch", {"enabled": False}, skill_id=skill_id)
    answers["enabled"] = answer("patch", {"enabled": True}, skill_id=skill_id)
    answers["invalidName"] = answer("post", {**draft, "name": "Late Delivery"})
    answers["missingDescription"] = answer(
        "post", {**draft, "name": "late-delivery", "description": ""}
    )
    answers["notFound"] = answer("put", draft, skill_id="999")
    answers["unsupportedMediaType"] = answer(
        "post", raw="name=x", ctype="application/x-www-form-urlencoded"
    )
    answers["unauthenticated"] = answer("get", anonymous=True)
    policy.refuse = True
    answers["refused"] = answer("post", {**draft, "name": "late-delivery"})
    policy.refuse = False
    for index in range(MAX_VISIBLE_SKILLS):
        Skill.objects.create(name=f"filler-{index}", description="d", body="b")
    answers["limit"] = answer("post", {**draft, "name": "one-too-many"})
    Skill.objects.filter(name__startswith="filler-").delete()
    view = SkillEditorView(ScopedPolicy(), csrf_exempt=True)
    answers["scopedCreated"] = answer("post", {**draft, "name": "team-handbook"})
    answers["scopedList"] = answer("get")
    event = skills_changed("weekly-report").model_dump(mode="json", by_alias=True)
    event = {key: value for key, value in event.items() if value is not None}
    event.pop("timestamp")
    record = {
        "recordedBy": "record_skill_editor_fixture.py",
        "djangoAgUi": version("django-ag-ui"),
        "answers": answers,
        "skillsChanged": event,
    }
    OUT.write_text(json.dumps(record, indent=2) + "\n")


if __name__ == "__main__":
    main()
