/**
 * A run that outlives its connection (`data-detach-runs`, django-ag-ui 0.82.0+).
 *
 * Everything here runs the element's own agent, `createHttpAgent`'s, over a
 * stubbed `fetch` answering with the bodies `scripts/record_detached_fixture.py`
 * recorded from a real mount: the live stream a client left, the run log's
 * JSON page and SSE replay, the `409` a second start gets, and the cancel
 * route. Only the real client applies the enforcement and verification a
 * replay has to pass, which a fake agent would skip.
 */

import { HttpAgent } from "@ag-ui/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, THREAD_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { DetachedHttpAgent } from "../src/core/detached_http_agent.js";
import recorded from "./fixtures/detached_runs.json";
import queued from "./fixtures/queued_start.json";
import listedRows from "./fixtures/thread_status.json";

const THREADS = "/agent/threads/";

beforeAll(() => {
  defineChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface Call {
  readonly url: string;
  readonly method: string;
  readonly init: RequestInit | undefined;
}

/** A stream the test feeds frame by frame, erroring as a browser does when its request is aborted. */
interface Live {
  readonly response: Response;
  push(text: string): void;
  end(): void;
}

function live(init: RequestInit | undefined, head: string): Live {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(encoder.encode(head));
    },
  });
  init?.signal?.addEventListener("abort", () => {
    try {
      controller.error(new DOMException("The operation was aborted.", "AbortError"));
    } catch {
      // Already closed.
    }
  });
  return {
    response: new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    push: (text) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
  };
}

function sse(body: string): Response {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The recorded replay, cut after its streamed text so a test can hold the run open there. */
function replayHalves(): [string, string] {
  const full = recorded.replayFromStart;
  const cut = full.indexOf("TEXT_MESSAGE_END");
  const at = full.lastIndexOf("\n\n", cut) + 2;
  return [full.slice(0, at), full.slice(at)];
}

/** A fresh run on `t1` the server streams to its end: a start, one answer, a finish. */
function finishedRun(runId: string, text: string): string {
  return [
    { type: "RUN_STARTED", threadId: "t1", runId },
    { type: "TEXT_MESSAGE_START", messageId: `m-${runId}`, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: `m-${runId}`, delta: text },
    { type: "TEXT_MESSAGE_END", messageId: `m-${runId}` },
    { type: "RUN_FINISHED", threadId: "t1", runId },
  ]
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("");
}

/** The server: which threads have a run going, what each stores, and how the next requests are answered. */
class Server {
  readonly calls: Call[] = [];
  readonly running = new Set<string>();
  readonly stored = new Map<string, unknown[]>();
  readonly starts: ((init: RequestInit | undefined) => Response)[] = [];
  readonly replays: ((init: RequestInit | undefined) => Response)[] = [];
  probeHold: Promise<void> | null = null;
  cancelStatus = 202;
  /** A thread's probe page, where it is not the recorded `r1` one. */
  readonly pages = new Map<string, unknown>();
  /** The thread list's SSE stream, once a `data-thread-status="stream"` watch asked for it. */
  threadList: Live | null = null;

  handle = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    this.calls.push({ url, method: init?.method ?? "GET", init });
    if (url === "/agent/") {
      const next = this.starts.shift();
      if (next === undefined) {
        throw new Error("no start answer queued");
      }
      return next(init);
    }
    if (url === THREADS) {
      if (new Headers(init?.headers).get("accept") === "text/event-stream") {
        this.threadList = live(init, "");
        return this.threadList.response;
      }
      return json(200, { threads: [] });
    }
    const match = /^\/(?:agent|late)\/threads\/([^/]+)\/(events\/|cancel\/)?(\?.*)?$/.exec(url);
    if (match === null) {
      return json(404, {});
    }
    const [, thread = "", route, query = ""] = match;
    if (route === "cancel/") {
      return this.cancelStatus === 202
        ? json(202, recorded.cancelAccepted.body)
        : json(404, recorded.cancelGone.body);
    }
    if (route === "events/" && query.includes("limit=1")) {
      await this.probeHold;
      if (!this.running.has(thread)) {
        return json(404, recorded.probeNeverRan.body);
      }
      return json(200, this.pages.get(thread) ?? recorded.probeRunning.body);
    }
    if (route === "events/") {
      const next = this.replays.shift();
      if (next === undefined) {
        throw new Error("no replay queued");
      }
      return next(init);
    }
    return json(200, { messages: this.stored.get(thread) ?? [] });
  };

  /** Requests to `route` (`events/`, `cancel/`), in order. */
  to(route: string): Call[] {
    return this.calls.filter((call) => call.url.includes(`/${route}`));
  }

  /** The bodies the run endpoint was posted. */
  starts_(): Record<string, unknown>[] {
    return this.calls
      .filter((call) => call.url === "/agent/")
      .map((call) => JSON.parse(String(call.init?.body)) as Record<string, unknown>);
  }
}

function mount(attrs: Record<string, string> = { "data-detach-runs": "" }): {
  el: AgUiChat;
  server: Server;
} {
  const server = new Server();
  vi.stubGlobal("fetch", vi.fn(server.handle));
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-threads-url", THREADS);
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return { el, server };
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

function transcriptText(el: AgUiChat): string {
  return shadow(el).querySelector(".messages")?.textContent ?? "";
}

/** Longer than the client waits for a joined run's claim to be let go before it asks again. */
async function releaseWait(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  await settle();
}

/** Long enough for the stubbed requests, the streams and the answer's frame-paced render. */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** Start a run on `t1` that the server keeps going: the recorded stream up to where its client left. */
async function startLiveRun(
  el: AgUiChat,
  server: Server,
  text = "Tell me the rest",
): Promise<Live> {
  let stream: Live | undefined;
  server.starts.push((init) => {
    server.running.add("t1");
    stream = live(init, recorded.liveUntilDetach);
    return stream.response;
  });
  void el.sendMessage(text);
  await settle();
  if (stream === undefined) {
    throw new Error("the run never started");
  }
  return stream;
}

function startInit(server: Server, index = 0): RequestInit | undefined {
  return server.calls.filter((call) => call.url === "/agent/")[index]?.init;
}

function quietAgentErrors(): void {
  vi.spyOn(console, "error").mockImplementation(() => {});
}

/** The replays asked for, the probe aside. */
function replays(server: Server): Call[] {
  return server.to("events/").filter((call) => !call.url.includes("limit"));
}

function failedText(el: AgUiChat): string {
  return shadow(el).querySelector(".message--failed")?.textContent ?? "";
}

function composerSend(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>("textarea");
  if (input === null) {
    throw new Error("no composer");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

describe("a detached run", () => {
  it("is finished on screen when its thread is switched away from and back, with no cancel", async () => {
    const { el, server } = mount();
    await el.switchThread("t1");
    await startLiveRun(el, server);

    await el.switchThread("t2");
    await settle();
    expect(startInit(server)?.signal?.aborted).toBe(true);
    server.replays.push(() => sse(recorded.replayFromStart));
    await el.switchThread("t1");
    await settle();

    expect(transcriptText(el)).toContain("partial answer and the rest");
    expect(server.to("cancel/")).toEqual([]);
    expect(el.running).toBe(false);
  });

  it("asks to detach on every request round", async () => {
    const { el, server } = mount();
    await el.switchThread("t1");
    el.registerTool({
      name: "pick_colour",
      description: "Let the person pick a colour.",
      parameters: { type: "object", properties: {} },
      handler: () => "blue",
    });
    server.starts.push(
      () => sse(recorded.toolRound),
      () => sse(recorded.answerRound.body as string),
    );
    await el.sendMessage("Pick a colour for me");
    await settle();

    const props = server.starts_().map((body) => body["forwardedProps"]);
    expect(props).toEqual([{ detach: true }, { detach: true }]);
    expect(transcriptText(el)).toContain("You picked it.");
  });

  it("joins the run when its thread is opened, running until the run finishes", async () => {
    const { el, server } = mount();
    await el.switchThread("t2");
    server.running.add("t1");
    const [head, rest] = replayHalves();
    let replay: Live | undefined;
    server.replays.push((init) => {
      replay = live(init, head);
      return replay.response;
    });
    await el.switchThread("t1");
    await settle();

    expect(el.running).toBe(true);
    expect(el.hasAttribute("data-running")).toBe(true);
    const [joined] = server.to("events/").filter((call) => !call.url.includes("limit"));
    expect(new Headers(joined?.init?.headers).get("accept")).toBe("text/event-stream");
    expect(joined?.url).toBe("/agent/threads/t1/events/?after=0");
    server.running.delete("t1");
    replay?.push(rest);
    replay?.end();
    await settle();

    expect(el.running).toBe(false);
    expect(el.hasAttribute("data-running")).toBe(false);
    expect(transcriptText(el)).toContain("partial answer and the rest");
  });

  it("joins the run on the thread it restores when it is inserted again", async () => {
    const { el, server } = mount();
    await el.switchThread("t1");
    await settle();
    el.remove();
    server.running.add("t1");
    server.replays.push(() => sse(recorded.replayFromStart));
    document.body.appendChild(el);
    await settle();

    expect(transcriptText(el)).toContain("partial answer and the rest");
  });

  it("draws the replay's opening snapshot in place of the stored transcript, with no notice", async () => {
    const { el, server } = mount();
    server.stored.set("t1", [
      { id: "u0", role: "user", content: "stale question" },
      { id: "a0", role: "assistant", content: "stale answer" },
    ]);
    server.running.add("t1");
    server.replays.push(() => sse(recorded.replayFromStart));
    await el.switchThread("t1");
    await settle();

    expect(transcriptText(el)).not.toContain("stale answer");
    expect(transcriptText(el)).toContain("partial answer and the rest");
    expect(shadow(el).querySelector(".run-notice--history-replaced")).toBeNull();
    expect(shadow(el).querySelector(".run-notice--interrupted")).toBeNull();
  });

  it("draws the earlier turns a later run's snapshot carries", async () => {
    const { el, server } = mount();
    server.stored.set("t4", [{ id: "a0", role: "assistant", content: "stale answer" }]);
    server.running.add("t4");
    server.replays.push(() => sse(recorded.secondTurnReplay));
    await el.switchThread("t4");
    await settle();

    expect(transcriptText(el)).toContain("First question");
    expect(transcriptText(el)).toContain("partial answer and the rest");
    expect(transcriptText(el)).not.toContain("stale answer");
  });

  it("still only notes a snapshot that arrives in an ordinary run", async () => {
    const { el, server } = mount();
    await el.switchThread("t1");
    const snapshot = {
      type: "MESSAGES_SNAPSHOT",
      messages: [{ id: "x", role: "user", content: "x" }],
    };
    server.starts.push(() =>
      sse(
        [
          { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
          snapshot,
          { type: "RUN_FINISHED", threadId: "t1", runId: "r1" },
        ]
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(""),
      ),
    );
    await el.sendMessage("hello");
    await settle();

    expect(shadow(el).querySelector(".run-notice--history-replaced")).not.toBeNull();
    expect(transcriptText(el)).toContain("hello");
  });

  it("is restored from the store alone when the factory's agent cannot connect", async () => {
    const { el, server } = mount();
    el.agentFactory = (options) =>
      new HttpAgent({
        url: options.endpoint,
        threadId: "t1",
        fetch: (url, init) => fetch(url, init),
      });
    server.stored.set("t1", [{ id: "u0", role: "user", content: "stored question" }]);
    server.running.add("t1");
    const seen: boolean[] = [];
    new MutationObserver(() => seen.push(el.hasAttribute("data-running"))).observe(el, {
      attributes: true,
      attributeFilter: ["data-running"],
    });
    await el.switchThread("t1");
    await settle();

    expect(server.to("events/").map((call) => call.url)).toEqual([
      "/agent/threads/t1/events/?after=0&limit=1",
    ]);
    expect(seen).not.toContain(true);
    expect(transcriptText(el)).toContain("stored question");
  });

  it("does not join a run once a thread listener has moved the element on", async () => {
    const { el, server } = mount();
    server.running.add("t1");
    el.addEventListener(THREAD_EVENT, (event) => {
      if ((event as CustomEvent<{ reason: string }>).detail.reason === "switch") {
        el.newChat();
      }
    });
    await el.switchThread("t1");
    await settle();

    expect(server.to("events/").length).toBe(1);
    expect(el.running).toBe(false);
  });

  it("does not join a run whose thread was left while the server was asked", async () => {
    const { el, server } = mount();
    server.running.add("t1");
    let answer!: () => void;
    server.probeHold = new Promise((resolve) => {
      answer = resolve;
    });
    void el.switchThread("t1");
    await settle();
    el.newChat();
    answer();
    await settle();

    expect(server.to("events/").length).toBe(1);
    expect(el.running).toBe(false);
  });
});

describe("a joined run", () => {
  it("runs a frontend tool its replay ends on, and posts the next round rather than replaying again", async () => {
    const { el, server } = mount();
    el.registerTool({
      name: "pick_colour",
      description: "Let the person pick a colour.",
      parameters: { type: "object", properties: {} },
      handler: () => "blue",
    });
    await el.switchThread("t2");
    server.running.add("t3");
    server.replays.push(() => sse(recorded.toolRound));
    server.starts.push(() => sse(recorded.answerRound.body as string));
    await el.switchThread("t3");
    await settle();

    expect(replays(server).length).toBe(1);
    expect(server.starts_().length).toBe(1);
    expect(transcriptText(el)).toContain("You picked it.");
  });

  it("does not warn about a message id it streamed itself before the Stop", async () => {
    quietAgentErrors();
    const warn = vi.spyOn(console, "warn");
    const { el, server } = mount();
    await el.switchThread("t1");
    const stream = await startLiveRun(el, server);
    stream.push(`data: ${JSON.stringify({ type: "TEXT_MESSAGE_END", messageId: "id-1" })}\n\n`);
    await settle();
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await settle();
    server.starts.push(() => json(409, recorded.busyStart.body));
    server.replays.push(() => sse(recorded.replayFromStart));
    server.starts.push(() => sse(finishedRun("r9", "a fresh answer")));
    composerSend(el, "And another thing");
    await settle();

    expect(transcriptText(el)).toContain("a fresh answer");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("reused message id");
  });

  it("is not joined twice when its replay is itself refused", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t2");
    server.running.add("t1");
    server.replays.push(() => json(409, { ...recorded.busyStart.body, run_id: "r2" }));
    await el.switchThread("t1");
    await settle();

    expect(replays(server).length).toBe(1);
    expect(failedText(el)).toContain("HTTP 409");
  });

  it("shows no unfinished-run notice for a stored question while its answer is still coming", async () => {
    const { el, server } = mount();
    server.stored.set("t1", [{ id: "u0", role: "user", content: "stored question" }]);
    server.running.add("t1");
    const [head] = replayHalves();
    const opening = head.slice(0, head.indexOf("\n\n") + 2);
    server.replays.push((init) => live(init, opening).response);
    await el.switchThread("t1");
    await settle();

    expect(el.running).toBe(true);
    expect(transcriptText(el)).toContain("stored question");
    expect(shadow(el).querySelector(".run-notice--interrupted")).toBeNull();
  });

  it("is not asked about when the restore resumes a navigating call", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    server.running.add("t1");
    el.conversationStore.saveCheckpoint("t1", { toolCallId: "nav-1" });
    server.starts.push(() => sse(finishedRun("r9", "resumed")));
    await el.switchThread("t1");
    await settle();

    expect(server.to("events/")).toEqual([]);
  });

  it("reports no thread change for a thread left while the server was asked", async () => {
    const { el, server } = mount();
    server.running.add("t1");
    let answer!: () => void;
    server.probeHold = new Promise((resolve) => {
      answer = resolve;
    });
    const reported: string[] = [];
    el.addEventListener(THREAD_EVENT, (event) => {
      reported.push((event as CustomEvent<{ threadId: string }>).detail.threadId);
    });
    void el.switchThread("t1");
    await settle();
    el.newChat();
    const left = reported.length;
    answer();
    await settle();

    expect(reported.slice(left)).not.toContain("t1");
  });

  it("sends a turn the composer parked during the restore once it has ended", async () => {
    const { el, server } = mount();
    const { answer, finish } = await openWhileRunning(server, el);
    composerSend(el, "typed turn");
    answer();
    await settle();
    expect(server.starts_()).toEqual([]);
    server.starts.push(() => sse(finishedRun("r9", "the typed answer")));
    await finish();

    expect(server.starts_().map(lastUserTurn)).toEqual(["typed turn"]);
  });
});

describe("Stop on a detached run", () => {
  it("posts the thread's cancel with the element's headers and credentials, then aborts", async () => {
    const { el, server } = mount({ "data-detach-runs": "", credentials: "include" });
    el.getHeaders = () => ({ "X-CSRFToken": "fresh" });
    await el.switchThread("t1");
    await startLiveRun(el, server);
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await settle();

    const [cancel] = server.to("cancel/");
    expect(cancel?.url).toBe("/agent/threads/t1/cancel/");
    expect(cancel?.method).toBe("POST");
    expect(cancel?.init?.headers).toMatchObject({ "X-CSRFToken": "fresh" });
    expect(cancel?.init?.credentials).toBe("include");
    expect(startInit(server)?.signal?.aborted).toBe(true);
    expect(shadow(el).querySelector(".stopped-note")).not.toBeNull();
  });

  it("says nothing when the run had already ended (a 404)", async () => {
    const { el, server } = mount();
    server.cancelStatus = 404;
    const errors = vi.spyOn(console, "error");
    await el.switchThread("t1");
    await startLiveRun(el, server);
    const input = shadow(el).querySelector<HTMLTextAreaElement>("textarea");
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();

    expect(server.to("cancel/").length).toBe(1);
    expect(errors).not.toHaveBeenCalled();
    expect(shadow(el).querySelector(".message--failed")).toBeNull();
  });

  it("is posted for the thread on screen when it is deleted mid-run, and not when idle", async () => {
    const { el, server } = mount();
    await el.switchThread("t1");
    el.deleteThread("t1");
    await settle();
    expect(server.to("cancel/")).toEqual([]);

    await el.switchThread("t1");
    await startLiveRun(el, server);
    el.deleteThread("t1");
    await settle();
    expect(server.to("cancel/").map((call) => call.url)).toEqual(["/agent/threads/t1/cancel/"]);
  });
});

describe("a start refused because a run holds the thread", () => {
  it("joins the run, keeps the turn queued, and sends it once that run has ended", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    await startLiveRun(el, server);
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await settle();
    expect(server.to("cancel/").length).toBe(1);

    server.starts.push(() => json(409, recorded.busyStart.body));
    const [head, rest] = replayHalves();
    let replay: Live | undefined;
    server.replays.push((init) => {
      replay = live(init, head);
      return replay.response;
    });
    server.starts.push(() => sse(finishedRun("r9", "a fresh answer")));
    const input = shadow(el).querySelector<HTMLTextAreaElement>("textarea");
    if (input === null) {
      throw new Error("no composer");
    }
    input.value = "And another thing";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await settle();

    expect(el.running).toBe(true);
    expect(shadow(el).querySelector(".queued-chip")?.textContent).toContain("And another thing");
    expect(server.starts_().length).toBe(2);
    replay?.push(rest);
    replay?.end();
    await settle();

    const bodies = server.starts_();
    expect(bodies.length).toBe(3);
    const messages = bodies[2]?.["messages"] as { role: string; content: unknown }[];
    expect(messages.at(-1)).toMatchObject({ role: "user", content: "And another thing" });
    expect(messages.filter((message) => message.content === "And another thing").length).toBe(1);
    expect(transcriptText(el)).toContain("a fresh answer");
    expect(el.running).toBe(false);
  });

  it("fails on a second refusal naming the same run rather than replaying it again", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(
      () => json(409, recorded.busyStart.body),
      () => json(409, recorded.busyStart.body),
      () => json(409, recorded.busyStart.body),
    );
    server.replays.push(() => sse(recorded.replayFromStart));
    await el.sendMessage("first");
    await settle();
    await releaseWait();

    expect(server.starts_().length).toBe(3);
    expect(server.to("events/").filter((call) => !call.url.includes("limit")).length).toBe(1);
    expect(shadow(el).querySelector(".message--failed")?.textContent).toContain(
      "the thread has a run in progress",
    );
  });

  it("sends the parked turn once when the server lets go of the joined run a moment late", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(
      () => json(409, recorded.busyStart.body),
      () => json(409, recorded.busyStart.body),
      () => sse(finishedRun("r9", "the parked answer")),
    );
    server.replays.push(() => sse(recorded.replayFromStart));
    await el.sendMessage("first");
    await settle();
    await releaseWait();

    expect(failedText(el)).toBe("");
    expect(transcriptText(el)).toContain("the parked answer");
    expect(server.starts_().map(lastUserTurn)).toEqual(["first", "first", "first"]);
    const messages = server.starts_()[2]?.["messages"] as { content: unknown }[];
    expect(messages.filter((message) => message.content === "first").length).toBe(1);
    expect(replays(server).length).toBe(1);
    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining("run in progress"));
  });

  it("joins the run for a host action, with no turn to send again", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(() => json(409, recorded.busyStart.body));
    server.replays.push(() => sse(recorded.replayFromStart));
    await el.run({ forwardedProps: { action: "approve" } });
    await settle();

    expect(server.starts_()[0]?.["forwardedProps"]).toEqual({ action: "approve", detach: true });
    expect(transcriptText(el)).toContain("partial answer and the rest");
    expect(shadow(el).querySelector(".queued-chip")).toBeNull();
  });

  it("keeps a refused turn's attachments, and sends them with it once that run has ended", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    const file = { id: "f1", name: "a.png", mime: "image/png", size: 1 };
    server.starts.push(() => json(409, recorded.busyStart.body));
    const [head, rest] = replayHalves();
    let replay: Live | undefined;
    server.replays.push((init) => {
      replay = live(init, head);
      return replay.response;
    });
    server.starts.push(() => sse(finishedRun("r9", "a fresh answer")));
    void el.sendMessage("Describe this", [file]);
    await settle();
    expect(shadow(el).querySelector(".queued-chip")?.textContent).toBe("Describe this");
    replay?.push(rest);
    replay?.end();
    await settle();

    const messages = server.starts_()[1]?.["messages"] as { metadata?: unknown }[];
    expect(messages.at(-1)).toMatchObject({
      content: "Describe this",
      metadata: { attachments: [file] },
    });
  });

  it("queues a refused turn that had only attachments under its files' names", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(() => json(409, recorded.busyStart.body));
    const [head, rest] = replayHalves();
    let replay: Live | undefined;
    server.replays.push((init) => {
      replay = live(init, head);
      return replay.response;
    });
    server.starts.push(() => sse(finishedRun("r9", "a fresh answer")));
    void el.sendMessage("", [
      { id: "f1", name: "a.png", mime: "image/png", size: 1 },
      { id: "f2", name: "b.pdf", mime: "application/pdf", size: 1 },
    ]);
    await settle();
    expect(shadow(el).querySelector(".queued-chip")?.textContent).toBe("a.png, b.pdf");
    replay?.push(rest);
    replay?.end();
    await settle();

    expect(transcriptText(el)).toContain("a fresh answer");
    const messages = server.starts_()[1]?.["messages"] as { metadata?: unknown }[];
    expect(messages.at(-1)).toMatchObject({
      content: "",
      metadata: { attachments: [{ id: "f1" }, { id: "f2" }] },
    });
  });

  it("is an error for an agent that cannot connect", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    el.agentFactory = (options) =>
      new HttpAgent({
        url: options.endpoint,
        threadId: "t1",
        fetch: (url, init) => fetch(url, init),
      });
    await el.switchThread("t1");
    server.starts.push(() => json(409, recorded.busyStart.body));
    await el.sendMessage("first");
    await settle();

    expect(failedText(el)).toContain("the thread has a run in progress");
    expect(replays(server)).toEqual([]);
    expect(shadow(el).querySelector(".queued-chip")).toBeNull();
  });

  it("is an error when the refusal names another thread", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(() => json(409, { ...recorded.busyStart.body, thread_id: "t9" }));
    await el.sendMessage("first");
    await settle();

    expect(failedText(el)).toContain("the thread has a run in progress");
    expect(replays(server)).toEqual([]);
    expect(shadow(el).querySelector(".queued-chip")).toBeNull();
  });

  it.each([
    ["a 500 that names the thread and a run", () => json(500, recorded.busyStart.body), "HTTP 500"],
    ["a 409 that names no run", () => json(409, { thread_id: "t1" }), "HTTP 409"],
    ["a 409 whose body is text", () => new Response("busy", { status: 409 }), "HTTP 409: busy"],
    ["a 409 whose body is null", () => json(409, null), "HTTP 409: null"],
  ])("is an error, not a reattach, for %s", async (_name, answer, shown) => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(answer);
    await el.sendMessage("first");
    await settle();

    expect(failedText(el)).toContain(shown);
    expect(replays(server)).toEqual([]);
    expect(shadow(el).querySelector(".queued-chip")).toBeNull();
  });

  it("is the failure itself when the request fails with something that is not an Error", async () => {
    quietAgentErrors();
    const { el } = mount();
    el.agentFactory = (options) =>
      new DetachedHttpAgent({
        url: options.endpoint,
        fetch: () => Promise.reject("offline"),
        eventsUrl: "/agent/threads/t1/events/",
      });
    await el.switchThread("t1");
    await el.sendMessage("first");
    await settle();

    expect(failedText(el)).toContain("offline");
  });

  it("is an error when a later request after the joined run fails, not a second reattach", async () => {
    quietAgentErrors();
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(
      () => json(409, recorded.busyStart.body),
      () => json(500, { error: "boom" }),
    );
    server.replays.push(() => sse(recorded.replayFromStart));
    void el.sendMessage("first");
    await settle();

    expect(server.starts_().length).toBe(2);
    expect(replays(server).length).toBe(1);
    expect(failedText(el)).toContain("HTTP 500");
  });
});

/** Open `t1` while its run goes on, holding the server's answer to the probe until `answer()`. */
async function openWhileRunning(
  server: Server,
  el: AgUiChat,
): Promise<{
  answer: () => void;
  finish: () => Promise<void>;
}> {
  await el.switchThread("t2");
  server.running.add("t1");
  let answer!: () => void;
  server.probeHold = new Promise((resolve) => {
    answer = resolve;
  });
  const [head, rest] = replayHalves();
  let replay: Live | undefined;
  server.replays.push((init) => {
    replay = live(init, head);
    return replay.response;
  });
  void el.switchThread("t1");
  await settle();
  return {
    answer,
    finish: async () => {
      server.running.delete("t1");
      replay?.push(rest);
      replay?.end();
      await settle();
    },
  };
}

function lastUserTurn(body: Record<string, unknown> | undefined): unknown {
  const messages = (body?.["messages"] ?? []) as { role: string; content: unknown }[];
  return messages.filter((message) => message.role === "user").at(-1)?.content;
}

describe("a host send made while the restore joins a run", () => {
  it("waits for the joined run and is sent after it, ahead of a turn the composer parked", async () => {
    const { el, server } = mount();
    const { answer, finish } = await openWhileRunning(server, el);
    let sent: boolean | undefined;
    void el.sendMessage("host turn").then((result) => {
      sent = result;
    });
    const input = shadow(el).querySelector<HTMLTextAreaElement>("textarea");
    if (input === null) {
      throw new Error("no composer");
    }
    input.value = "typed turn";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    answer();
    await settle();

    expect(el.running).toBe(true);
    expect(sent).toBeUndefined();
    expect(server.starts_()).toEqual([]);
    server.starts.push(
      () => sse(finishedRun("r8", "the host's answer")),
      () => sse(finishedRun("r9", "the typed answer")),
    );
    await finish();

    expect(sent).toBe(true);
    expect(server.starts_().map(lastUserTurn)).toEqual(["host turn", "typed turn"]);
    expect(transcriptText(el)).toContain("the typed answer");
  });

  it("is not sent when the joined run is stopped", async () => {
    const { el, server } = mount();
    const { answer } = await openWhileRunning(server, el);
    const sent = el.sendMessage("host turn");
    answer();
    await settle();
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();

    expect(await sent).toBe(false);
    await settle();
    expect(server.starts_()).toEqual([]);
  });

  it("is not sent when New chat is pressed during the joined run", async () => {
    const { el, server } = mount();
    const { answer } = await openWhileRunning(server, el);
    const sent = el.sendMessage("host turn");
    answer();
    await settle();
    el.newChat();

    expect(await sent).toBe(false);
    await settle();
    expect(server.starts_()).toEqual([]);
  });
});

describe("a start a queued mount answers with its ids", () => {
  it("follows the run log, renders the run, and keeps the turn for the next request", async () => {
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(() => json(queued.queuedStart.status, queued.queuedStart.body));
    server.replays.push(() => sse(queued.queuedReplay));
    await el.sendMessage("Queue this one");
    await settle();

    expect(failedText(el)).toBe("");
    expect(transcriptText(el)).toContain("Queue this one");
    expect(transcriptText(el)).toContain("queued answer");
    expect(replays(server).map((call) => call.url)).toEqual(["/agent/threads/t1/events/?after=0"]);
    expect(el.running).toBe(false);
    server.starts.push(() => sse(finishedRun("r9", "the next answer")));
    await el.sendMessage("And then");
    await settle();

    const messages = server.starts_()[1]?.["messages"] as { role: string; content: unknown }[];
    expect(messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "Queue this one"],
      ["assistant", "queued answer"],
      ["user", "And then"],
    ]);
  });
});

describe("a data-threads-url set after the element connected", () => {
  it("is not warned about before the element connects", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-threads-url", "/late/threads/");

    expect(warn).not.toHaveBeenCalled();
  });

  it("is where the next reattach and cancel go", async () => {
    quietAgentErrors();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { el, server } = mount();
    await el.switchThread("t1");
    server.starts.push(() => sse(finishedRun("r8", "a first answer")));
    await el.sendMessage("hello");
    await settle();
    el.setAttribute("data-threads-url", "/late/threads/");
    el.setAttribute("data-threads-url", "/late/threads/");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "The next run replay and cancel go to the new URL, but the thread list",
    );

    server.starts.push(
      () => json(409, recorded.busyStart.body),
      () => sse(finishedRun("r9", "a later answer")),
    );
    server.replays.push(() => sse(recorded.replayFromStart));
    await el.sendMessage("again");
    await settle();
    expect(replays(server).map((call) => call.url)).toEqual(["/late/threads/t1/events/?after=0"]);

    await startLiveRun(el, server);
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await settle();
    expect(server.to("cancel/").map((call) => call.url)).toEqual(["/late/threads/t1/cancel/"]);
  });
});

describe("without data-detach-runs", () => {
  it("asks nothing, sends no detach, and a switch or a Stop cancels by aborting as before", async () => {
    const { el, server } = mount({});
    await el.switchThread("t1");
    await startLiveRun(el, server);
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await settle();
    await startLiveRun(el, server);
    await el.switchThread("t2");
    await el.switchThread("t1");
    await settle();

    expect(server.to("events/")).toEqual([]);
    expect(server.to("cancel/")).toEqual([]);
    expect(server.starts_().map((body) => body["forwardedProps"])).toEqual([{}, {}]);
    expect(startInit(server, 0)?.signal?.aborted).toBe(true);
    expect(startInit(server, 1)?.signal?.aborted).toBe(true);
  });

  it("does nothing without data-threads-url either", async () => {
    const server = new Server();
    vi.stubGlobal("fetch", vi.fn(server.handle));
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-detach-runs", "");
    document.body.appendChild(el);
    server.starts.push(() => sse(finishedRun("r1", "ok")));
    await el.sendMessage("hello");
    await settle();

    expect(server.starts_()[0]?.["forwardedProps"]).toEqual({});
    expect(server.to("events/")).toEqual([]);
  });

  it("joins the run on a 409 when detachRuns is set after the first turn", async () => {
    const { el, server } = mount({});
    await el.switchThread("t1");
    server.starts.push(() => sse(finishedRun("r1", "first answer")));
    await el.sendMessage("first");
    await settle();
    el.detachRuns = true;
    server.starts.push(() => json(409, recorded.busyStart.body));
    server.replays.push(() => sse(recorded.replayFromStart));
    server.starts.push(() => sse(finishedRun("r9", "a fresh answer")));
    composerSend(el, "And another thing");
    await settle();

    expect(replays(server).length).toBe(1);
    expect(failedText(el)).toBe("");
    expect(transcriptText(el)).toContain("a fresh answer");
  });

  it("shows a 409 as an error, and joins nothing", async () => {
    quietAgentErrors();
    const { el, server } = mount({});
    await el.switchThread("t1");
    server.starts.push(() => json(409, recorded.busyStart.body));
    await el.sendMessage("first");
    await settle();

    expect(failedText(el)).toContain("the thread has a run in progress");
    expect(server.to("events/")).toEqual([]);
    expect(shadow(el).querySelector(".queued-chip")).toBeNull();
  });

  it("reflects the detachRuns property as the attribute", () => {
    const { el } = mount({});
    expect(el.detachRuns).toBe(false);
    el.detachRuns = true;
    expect(el.hasAttribute("data-detach-runs")).toBe(true);
    el.detachRuns = false;
    expect(el.hasAttribute("data-detach-runs")).toBe(false);
  });
});

/** The second run's probe page: the recorded shape, naming the run `secondTurnReplay` replays. */
const SERVER_RUN_PAGE = { ...recorded.probeRunning.body, thread_id: "t4", run_id: "r7" };

/** A thread list frame naming `threadId` running, as the recorded row while a run works. */
function listRunning(server: Server, threadId: string, etag: string): void {
  const row = { ...listedRows.rowWhileRunning, thread_id: threadId };
  server.threadList?.push(`id: "${etag}"\ndata: ${JSON.stringify({ threads: [row] })}\n\n`);
}

/** Open `t4` idle on its first turn, then have the server start the run a report woke on it. */
async function openThenWake(el: AgUiChat, server: Server): Promise<void> {
  server.stored.set("t4", [
    { id: "u-r6", role: "user", content: "First question" },
    { id: "id-3", role: "assistant", content: "partial answer and the rest" },
  ]);
  await el.switchThread("t4");
  await settle();
  server.running.add("t4");
  server.pages.set("t4", SERVER_RUN_PAGE);
  server.replays.push(() => sse(recorded.secondTurnReplay));
}

function answers(el: AgUiChat): number {
  return transcriptText(el).split("partial answer and the rest").length - 1;
}

describe("a run the server starts on the thread on screen, under data-thread-status", () => {
  it("is joined when the watch lists the thread running, and drawn to its end", async () => {
    const { el, server } = mount({ "data-detach-runs": "", "data-thread-status": "stream" });
    await openThenWake(el, server);
    listRunning(server, "t4", "e1");
    await settle();

    expect(replays(server).map((call) => call.url)).toEqual(["/agent/threads/t4/events/?after=0"]);
    expect(answers(el)).toBe(2);
    expect(el.running).toBe(false);
  });

  it("is not joined while the chat drives its own run, nor once that run ended and still lists running", async () => {
    const { el, server } = mount({ "data-detach-runs": "", "data-thread-status": "stream" });
    await el.switchThread("t1");
    const stream = await startLiveRun(el, server);
    const asked = server.to("events/").length;
    listRunning(server, "t1", "e1");
    await settle();
    expect(server.to("events/").length).toBe(asked);

    stream.push(replayHalves()[1]);
    stream.end();
    await settle();
    expect(el.running).toBe(false);
    listRunning(server, "t1", "e2");
    await settle();

    expect(server.to("events/").length).toBe(asked + 2);
    expect(replays(server)).toEqual([]);
    expect(el.running).toBe(false);
  });

  it("sends a turn typed during the joined run once that run has ended", async () => {
    const { el, server } = mount({ "data-detach-runs": "", "data-thread-status": "stream" });
    await openThenWake(el, server);
    const full = recorded.secondTurnReplay;
    const cut = full.lastIndexOf("\n\n", full.indexOf("RUN_FINISHED")) + 2;
    let replay: Live | undefined;
    server.replays.splice(0, 1, (init) => {
      replay = live(init, full.slice(0, cut));
      return replay.response;
    });
    listRunning(server, "t4", "e1");
    await settle();
    expect(el.running).toBe(true);
    const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
    if (input === null) {
      throw new Error("no composer");
    }
    input.value = "And another";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    server.starts.push(() => sse(finishedRun("r8", "the next answer")));
    server.running.delete("t4");
    replay?.push(full.slice(cut));
    replay?.end();
    await settle();

    expect(server.starts_().length).toBe(1);
    expect(transcriptText(el)).toContain("the next answer");
  });

  it("is joined once, not again when a later list still says running", async () => {
    const { el, server } = mount({ "data-detach-runs": "", "data-thread-status": "stream" });
    await openThenWake(el, server);
    listRunning(server, "t4", "e1");
    await settle();
    listRunning(server, "t4", "e2");
    await settle();

    expect(replays(server).length).toBe(1);
  });

  it("is not joined once the person moved on while the server was asked", async () => {
    const { el, server } = mount({ "data-detach-runs": "", "data-thread-status": "stream" });
    await openThenWake(el, server);
    let answer!: () => void;
    server.probeHold = new Promise((resolve) => {
      answer = resolve;
    });
    listRunning(server, "t4", "e1");
    await settle();
    el.newChat();
    answer();
    await settle();

    expect(replays(server)).toEqual([]);
    expect(el.running).toBe(false);
  });

  it("is not looked for when another thread lists running, or the log says it has ended", async () => {
    const { el, server } = mount({ "data-detach-runs": "", "data-thread-status": "stream" });
    await openThenWake(el, server);
    listRunning(server, "t9", "e1");
    await settle();
    expect(server.to("events/").length).toBe(1);

    server.pages.set("t4", recorded.probeIdle.body);
    listRunning(server, "t4", "e2");
    await settle();

    expect(server.to("events/").length).toBe(2);
    expect(replays(server)).toEqual([]);
  });

  it("is not looked for without data-detach-runs", async () => {
    const { el, server } = mount({ "data-thread-status": "stream" });
    await openThenWake(el, server);
    listRunning(server, "t4", "e1");
    await settle();

    expect(server.to("events/")).toEqual([]);
  });

  it("is not joined by an agent that cannot connect", async () => {
    const { el, server } = mount({ "data-detach-runs": "", "data-thread-status": "stream" });
    el.agentFactory = (options) =>
      new HttpAgent({
        url: options.endpoint,
        threadId: "t4",
        fetch: (url, init) => fetch(url, init),
      });
    await openThenWake(el, server);
    listRunning(server, "t4", "e1");
    await settle();

    expect(replays(server)).toEqual([]);
    expect(el.running).toBe(false);
  });
});

describe("data-poll-runs", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("joins a run the server started on the thread on screen, with no thread watch", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { el, server } = mount({ "data-detach-runs": "", "data-poll-runs": "" });
    await openThenWake(el, server);
    await vi.advanceTimersByTimeAsync(5000);
    await settle();

    expect(server.threadList).toBeNull();
    expect(replays(server).map((call) => call.url)).toEqual(["/agent/threads/t4/events/?after=0"]);
    expect(answers(el)).toBe(2);
  });

  it("stops when the attribute is removed or the element leaves the page", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { el, server } = mount({ "data-detach-runs": "", "data-poll-runs": "" });
    await openThenWake(el, server);
    el.removeAttribute("data-poll-runs");
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.to("events/").length).toBe(1);

    el.setAttribute("data-poll-runs", "");
    el.remove();
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.to("events/").length).toBe(1);
  });
});
