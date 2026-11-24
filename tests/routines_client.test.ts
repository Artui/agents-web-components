import { describe, expect, it, vi } from "vitest";
import { RoutinesClient } from "../src/ui/routines/routines_client.js";
import recorded from "./fixtures/routines.json";

const { answers } = recorded;

function reply(answer: { status: number; body: unknown }): Response {
  return new Response(JSON.stringify(answer.body), {
    status: answer.status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(answer: { status: number; body: unknown } | Error) {
  const request = vi.fn(async (_url: string, _init: RequestInit) => {
    if (answer instanceof Error) {
      throw answer;
    }
    return reply(answer);
  });
  return { request, routines: new RoutinesClient("/agent/routines", request) };
}

const DRAFT = {
  name: "cleanup",
  prompt: "Drop the scratch tables.",
  schedule: { kind: "interval", every_hours: 6 },
  timezone: "Europe/Paris",
  enabled: true,
  preapprovedTools: ["drop_table"],
  confirmDestructive: ["drop_table"],
} as const;

describe("RoutinesClient", () => {
  it("reads the recorded list: each routine and the grantable tools with their flags", async () => {
    const { request, routines } = client(answers.list);
    const result = await routines.list();
    expect(request).toHaveBeenCalledWith("/agent/routines/", { method: "GET" });
    if (!result.ok) {
      throw new Error("expected a list");
    }
    expect(result.value.grantable).toEqual([
      { name: "look", destructive: false },
      { name: "drop_table", destructive: true },
    ]);
    const [standup, cleanup] = result.value.routines;
    expect(standup).toMatchObject({
      id: "1",
      name: "standup",
      schedule: { kind: "weekly", weekdays: [0, 1, 2, 3, 4], at: "08:00" },
      timezone: "Europe/Paris",
      enabled: true,
      pausedReason: "",
      preapprovedTools: [{ name: "look", destructive: false }],
    });
    expect(standup?.nextFireAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(standup?.lastThreadId).toBe(answers.ranNow.body.threadId);
    expect(cleanup).toMatchObject({
      schedule: { kind: "interval", every_hours: 6 },
      preapprovedTools: [{ name: "drop_table", destructive: true }],
      lastThreadId: null,
    });
  });

  it("drops a malformed routine, a nameless tool and a non-integer weekday, and defaults the rest", async () => {
    const { routines } = client({
      status: 200,
      body: {
        routines: [
          null,
          { id: "9", name: "x", prompt: "p", timezone: "UTC", schedule: { kind: "monthly" } },
          {
            id: 1,
            name: "x",
            prompt: "p",
            timezone: "UTC",
            schedule: { kind: "interval", every_hours: 2 },
          },
          {
            id: "3",
            name: "bare",
            prompt: "p",
            timezone: "UTC",
            schedule: { kind: "weekly", weekdays: [0, "1", 2.5, 6], at: "07:30" },
            preapprovedTools: [{ name: "look" }, { destructive: true }, null],
          },
          {
            id: "4",
            name: "n",
            prompt: "p",
            timezone: "UTC",
            schedule: { kind: "interval", every_hours: 1 },
          },
        ],
      },
    });
    const result = await routines.list();
    expect(result).toEqual({
      ok: true,
      value: {
        grantable: [],
        routines: [
          {
            id: "3",
            name: "bare",
            prompt: "p",
            schedule: { kind: "weekly", weekdays: [0, 6], at: "07:30" },
            timezone: "UTC",
            enabled: true,
            pausedReason: "",
            nextFireAt: null,
            preapprovedTools: [{ name: "look", destructive: false }],
            lastThreadId: null,
          },
          expect.objectContaining({ id: "4", preapprovedTools: [] }),
        ],
      },
    });
  });

  it("refuses a list body without routines, and a 401 with the server's words", async () => {
    expect(await client({ status: 200, body: { grantable: [] } }).routines.list()).toEqual({
      ok: false,
      status: 200,
      message: null,
      destructive: [],
    });
    expect(await client({ status: 401, body: { error: "Log in." } }).routines.list()).toEqual({
      ok: false,
      status: 401,
      message: "Log in.",
      destructive: [],
    });
  });

  it("creates with a JSON POST and reads the 409's destructive names", async () => {
    const { request, routines } = client(answers.destructiveUnconfirmed);
    const result = await routines.create(DRAFT);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/agent/routines/");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(DRAFT);
    expect(result).toEqual({
      ok: false,
      status: 409,
      message: answers.destructiveUnconfirmed.body.error,
      destructive: ["drop_table"],
    });
  });

  it("keeps only the string names of a 409's destructive list", async () => {
    const { routines } = client({ status: 409, body: { error: "e", destructive: ["a", 1] } });
    const result = await routines.create(DRAFT);
    expect(result.ok === false && result.destructive).toEqual(["a"]);
  });

  it("replaces with a PUT on the item, and pauses with a PATCH carrying only enabled", async () => {
    const put = client(answers.created);
    await put.routines.update("a/b", DRAFT);
    expect(put.request.mock.calls[0]?.[0]).toBe("/agent/routines/a%2Fb/");
    expect(put.request.mock.calls[0]?.[1].method).toBe("PUT");

    const patch = client(answers.paused);
    const result = await patch.routines.setEnabled("1", false);
    const [url, init] = patch.request.mock.calls[0] as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual([
      "/agent/routines/1/",
      "PATCH",
      '{"enabled":false}',
    ]);
    expect(result.ok && result.value.enabled).toBe(false);
    expect(result.ok && result.value.nextFireAt).toBeNull();
  });

  it("runs now with a JSON POST, since the editor refuses a write that is not JSON", async () => {
    const { request, routines } = client(answers.ranNow);
    const result = await routines.runNow("1");
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual(["/agent/routines/1/run/", "POST", "{}"]);
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(result).toEqual({ ok: true, value: answers.ranNow.body.threadId });
    expect(await client({ status: 202, body: {} }).routines.runNow("1")).toMatchObject({
      ok: false,
      status: 202,
    });
    expect(await client(answers.busy).routines.runNow("1")).toMatchObject({
      ok: false,
      status: 409,
      message: answers.busy.body.error,
    });
  });

  it("reads the firings newest first, and a run with neither thread nor state", async () => {
    const { request, routines } = client(answers.runsFinished);
    expect(await routines.runs("1")).toEqual({
      ok: true,
      value: [{ threadId: answers.ranNow.body.threadId, state: "finished" }],
    });
    expect(request.mock.calls[0]?.[0]).toBe("/agent/routines/1/runs/");
    expect(
      await client({
        status: 200,
        body: { runs: [{ runId: null, threadId: null, state: null }, null] },
      }).routines.runs("1"),
    ).toEqual({
      ok: true,
      value: [
        { threadId: null, state: null },
        { threadId: null, state: null },
      ],
    });
    expect(await client({ status: 200, body: {} }).routines.runs("1")).toMatchObject({ ok: false });
  });

  it("answers status 0 when the request never got an answer, and reads a body that is not JSON", async () => {
    expect(await client(new TypeError("offline")).routines.list()).toEqual({
      ok: false,
      status: 0,
      message: null,
      destructive: [],
    });
    const html = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect(await new RoutinesClient("/r/", html).list()).toMatchObject({ ok: false, status: 200 });
    const request = vi.fn(async () => new Response("<html>", { status: 500 }));
    expect(await new RoutinesClient("/r/", request).list()).toEqual({
      ok: false,
      status: 500,
      message: null,
      destructive: [],
    });
  });
});
