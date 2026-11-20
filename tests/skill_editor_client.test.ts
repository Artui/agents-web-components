import { describe, expect, it, vi } from "vitest";
import { SkillEditorClient } from "../src/skills/skill_editor_client.js";
import recorded from "./fixtures/skill_editor.json";

type Answer = { readonly status: number; readonly body: unknown };
const ANSWERS: Readonly<Record<string, Answer>> = recorded.answers;

function answer(name: string): Answer {
  const found = ANSWERS[name];
  if (found === undefined) {
    throw new Error(`no recorded answer named "${name}"`);
  }
  return found;
}

function respond(name: string): Response {
  const { status, body } = answer(name);
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DRAFT = {
  name: "weekly-report",
  description: "Summarise the week.",
  body: "Collect the tickets.",
  userInvocable: true,
  modelInvocable: false,
};

describe("SkillEditorClient over django-ag-ui's recorded answers", () => {
  it("was recorded from the released view", () => {
    expect(recorded.recordedBy).toBe("record_skill_editor_fixture.py");
    expect(recorded.djangoAgUi).toBe("0.83.0");
  });

  it("lists the skills the server serves", async () => {
    const request = vi.fn(async () => respond("list"));
    const result = await new SkillEditorClient("/agent/skills/editor/", request).list();

    expect(request).toHaveBeenCalledWith("/agent/skills/editor/", { method: "GET" });
    expect(result).toEqual({
      ok: true,
      value: (answer("list").body as { skills: unknown }).skills,
    });
  });

  it("drops a listed entry it cannot read whole", async () => {
    const broken = {
      skills: [{ id: "1", name: "x" }, ...(answer("list").body as { skills: unknown[] }).skills],
    };
    const request = vi.fn(async () => new Response(JSON.stringify(broken), { status: 200 }));
    const result = await new SkillEditorClient("/e/", request).list();

    expect(result.ok && result.value.map((skill) => skill.name)).toEqual(["weekly-report"]);
  });

  it("creates with a JSON POST to the collection, adding the trailing slash", async () => {
    const request = vi.fn(async (_url: string, _init: RequestInit) => respond("created"));
    const result = await new SkillEditorClient("/agent/skills/editor", request).create(DRAFT);

    expect(request).toHaveBeenCalledWith("/agent/skills/editor/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DRAFT),
    });
    expect(result).toEqual({ ok: true, value: answer("created").body });
  });

  it("replaces with a PUT to the item route, slash-terminated", async () => {
    const request = vi.fn(async (_url: string, _init: RequestInit) => respond("updated"));
    await new SkillEditorClient("/e/", request).update("1", DRAFT);

    expect(request.mock.calls[0]?.[0]).toBe("/e/1/");
    expect(request.mock.calls[0]?.[1].method).toBe("PUT");
  });

  it("turns a skill off and on with a PATCH of enabled", async () => {
    const request = vi.fn(async (_url: string, init: RequestInit) =>
      respond(JSON.parse(String(init.body)).enabled ? "enabled" : "disabled"),
    );
    const client = new SkillEditorClient("/e/", request);

    const off = await client.setEnabled("1", false);
    const on = await client.setEnabled("1", true);

    expect(request.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ["/e/1/", "PATCH", '{"enabled":false}'],
      ["/e/1/", "PATCH", '{"enabled":true}'],
    ]);
    expect(off.ok && off.value.enabled).toBe(false);
    expect(on.ok && on.value.enabled).toBe(true);
  });

  it.each([
    ["invalidName", 400],
    ["missingDescription", 400],
    ["refused", 403],
    ["notFound", 404],
    ["limit", 409],
    ["unsupportedMediaType", 415],
    ["unauthenticated", 401],
  ])("carries the %s refusal's status and message, naming no field", async (name, status) => {
    const request = vi.fn(async () => respond(name));
    const result = await new SkillEditorClient("/e/", request).create(DRAFT);

    expect(result).toEqual({
      ok: false,
      status,
      message: (answer(name).body as { error: string }).error,
      field: null,
    });
  });

  it("carries a field the answer names", async () => {
    const body = { error: "A skill needs a description.", field: "description" };
    const request = vi.fn(async () => new Response(JSON.stringify(body), { status: 400 }));
    const result = await new SkillEditorClient("/e/", request).create(DRAFT);

    expect(result).toMatchObject({ ok: false, field: "description" });
  });

  it("reports a body that is no envelope as a refusal with no message", async () => {
    const request = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
    const result = await new SkillEditorClient("/e/", request).create(DRAFT);

    expect(result).toEqual({ ok: false, status: 502, message: null, field: null });
  });

  it("reports an envelope whose keys are not strings as a refusal with no message", async () => {
    const request = vi.fn(
      async () => new Response(JSON.stringify({ error: 1, field: 2 }), { status: 400 }),
    );
    const result = await new SkillEditorClient("/e/", request).create(DRAFT);

    expect(result).toEqual({ ok: false, status: 400, message: null, field: null });
  });

  it("treats a success it cannot read as a refusal", async () => {
    const request = vi.fn(
      async () => new Response(JSON.stringify({ skills: "no" }), { status: 200 }),
    );
    const result = await new SkillEditorClient("/e/", request).list();

    expect(result).toEqual({ ok: false, status: 200, message: null, field: null });
  });

  it("reports a request that never got an answer as status 0", async () => {
    const request = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const result = await new SkillEditorClient("/e/", request).list();

    expect(result).toEqual({ ok: false, status: 0, message: null, field: null });
  });
});
