/** The probe and the cancel beside `data-threads-url`, answered with the recorded bodies. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DetachedRuns } from "../src/core/detached_runs.js";
import recorded from "./fixtures/detached_runs.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function runs(credentials?: RequestCredentials): DetachedRuns {
  return new DetachedRuns(
    "/agent/threads",
    (url) => ({ "X-For": url }),
    () => credentials,
  );
}

/** Whether the probe finds a run going, as the restore asks it. */
async function running(routes: DetachedRuns): Promise<boolean> {
  return (await routes.probe("t1"))?.status === "running";
}

describe("DetachedRuns", () => {
  it("derives each thread's routes from the threads URL", () => {
    expect(runs().eventsUrl("a b")).toBe("/agent/threads/a%20b/events/");
  });

  it("reads nothing from an error page, whatever its body says", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(500, recorded.probeRunning.body)),
    );

    expect(await running(runs())).toBe(false);
  });

  it("reads a running run from one JSON page of its log", async () => {
    const fetch = vi.fn(async () => json(200, recorded.probeRunning.body));
    vi.stubGlobal("fetch", fetch);

    expect(await running(runs("include"))).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/agent/threads/t1/events/?after=0&limit=1");
    expect(init.headers).toEqual({ "X-For": url, Accept: "application/json" });
    expect(init.credentials).toBe("include");
  });

  it.each([
    ["an idle run", () => json(200, recorded.probeIdle.body)],
    ["a parked run", () => json(200, recorded.probeParked.body)],
    ["a thread that never ran", () => json(404, recorded.probeNeverRan.body)],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("answers no for %s", async (_name, answer) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer()),
    );

    expect(await running(runs())).toBe(false);
  });

  it("answers no when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );

    expect(await running(runs())).toBe(false);
  });

  it("posts a cancel, and says nothing whether it lands, finds no run, or fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(202, recorded.cancelAccepted.body))
      .mockResolvedValueOnce(json(404, recorded.cancelGone.body))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetch);

    await runs("include").cancel("t1");
    await runs().cancel("t1");
    await runs().cancel("t1");
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/agent/threads/t1/cancel/");
    expect(init).toEqual({ method: "POST", headers: { "X-For": url }, credentials: "include" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});

describe("DetachedRuns with an async header source", () => {
  it("sends the resolved header on the probe and the cancel", async () => {
    const spy = vi.fn(async () => json(200, { status: "idle" }));
    vi.stubGlobal("fetch", spy);
    const routes = new DetachedRuns(
      "/agent/threads",
      async () => ({ Authorization: "Bearer t" }),
      () => undefined,
    );
    await running(routes);
    await routes.cancel("t1");
    const sent = spy.mock.calls.map((call) =>
      new Headers((call as unknown as [string, RequestInit])[1].headers).get("Authorization"),
    );
    expect(sent).toEqual(["Bearer t", "Bearer t"]);
  });

  it("reads a rejected source as no run, and cancels nothing", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const routes = new DetachedRuns(
      "/agent/threads",
      () => Promise.reject(new Error("refresh failed")),
      () => undefined,
    );
    expect(await running(routes)).toBe(false);
    await routes.cancel("t1");
    expect(spy).not.toHaveBeenCalled();
  });
});
