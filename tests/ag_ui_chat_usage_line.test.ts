import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";

defineChat();

type Event = Record<string, unknown>;

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function sse(events: readonly Event[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** An answered run whose RUN_FINISHED carries `finish` (its usage, when there is one). */
function answered(n: number, finish: Event = {}, middle: readonly Event[] = []): Event[] {
  return [
    { type: "RUN_STARTED", threadId: "t1", runId: `r${n}` },
    ...middle,
    { type: "TEXT_MESSAGE_START", messageId: `a${n}`, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: `a${n}`, delta: `answer ${n}` },
    { type: "TEXT_MESSAGE_END", messageId: `a${n}` },
    { type: "RUN_FINISHED", threadId: "t1", runId: `r${n}`, ...finish },
  ];
}

/** Answer the run POSTs with `runs` in turn, and the history reads with an empty list. */
function stubRuns(...runs: readonly Event[][]): void {
  let n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.body === undefined) {
        return new Response(JSON.stringify({ runs: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      n += 1;
      return sse(runs[n - 1] ?? answered(n));
    }),
  );
}

function mountReal(attrs: Record<string, string> = { "show-usage": "" }): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function lines(el: AgUiChat): string[] {
  return [...shadow(el).querySelectorAll(".usage-line")].map((line) => line.textContent ?? "");
}

async function turn(el: AgUiChat): Promise<void> {
  await el.sendMessage("go");
  await settle();
}

/** A run that pauses on a server-side approval, its RUN_FINISHED carrying `usage`. */
function awaitingApproval(usage: readonly Event[]): Event[] {
  return [
    { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
    { type: "TOOL_CALL_START", toolCallId: "call-2", toolCallName: "delete_order" },
    { type: "TOOL_CALL_ARGS", toolCallId: "call-2", delta: "{}" },
    { type: "TOOL_CALL_END", toolCallId: "call-2" },
    {
      type: "RUN_FINISHED",
      threadId: "t1",
      runId: "r1",
      usage,
      outcome: {
        type: "interrupt",
        interrupts: [
          {
            id: "interrupt-1",
            reason: "approval_required",
            message: "Delete?",
            toolCallId: "call-2",
          },
        ],
      },
    },
  ];
}

/** Send without awaiting the turn, which an open approval card holds open. */
async function startTurn(el: AgUiChat): Promise<void> {
  void el.sendMessage("go");
  await settle();
  expect(shadow(el).querySelector(".approval")).not.toBeNull();
}

describe("the usage line", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws both sides under the finished answer when show-usage is set", async () => {
    stubRuns(answered(1, { usage: [{ inputTokens: 1234, outputTokens: 567 }] }));
    const el = mountReal();

    await turn(el);

    expect(lines(el)).toEqual(["1,234 in · 567 out tokens"]);
    const line = shadow(el).querySelector(".usage-line");
    expect(line?.getAttribute("part")).toBe("usage-line");
    const answer = [...shadow(el).querySelectorAll(".message--assistant")].at(-1);
    expect(answer?.compareDocumentPosition(line as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("sums every entry, one per provider and model", async () => {
    stubRuns(
      answered(1, {
        usage: [
          { model: "a", inputTokens: 1000, outputTokens: 20 },
          { model: "b", inputTokens: 1000000, outputTokens: 5 },
        ],
      }),
    );
    const el = mountReal();

    await turn(el);

    expect(lines(el)).toEqual(["1,001,000 in · 25 out tokens"]);
  });

  it.each([
    [{ inputTokens: 12 }, "12 in tokens"],
    [{ outputTokens: 7 }, "7 out tokens"],
  ])("omits a side the server did not send (%o)", async (entry, text) => {
    stubRuns(answered(1, { usage: [entry] }));
    const el = mountReal();

    await turn(el);

    expect(lines(el)).toEqual([text]);
  });

  it.each([
    ["no usage on RUN_FINISHED", {}],
    ["an empty usage list", { usage: [] }],
    ["entries with neither count", { usage: [{ model: "a", totalTokens: 3 }] }],
  ])("draws nothing for %s", async (_name, finish) => {
    stubRuns(answered(1, finish));
    const el = mountReal();

    await turn(el);

    expect(lines(el)).toEqual([]);
  });

  it.each([
    ["absent", {}],
    ['"false"', { "show-usage": "false" }],
  ])("draws nothing with show-usage %s", async (_name, attrs) => {
    stubRuns(answered(1, { usage: [{ inputTokens: 5, outputTokens: 6 }] }));
    const el = mountReal(attrs);

    await turn(el);

    expect(lines(el)).toEqual([]);
  });

  it("draws nothing under a failed run", async () => {
    stubRuns([
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
      { type: "RUN_ERROR", message: "boom", code: "error" },
    ]);
    const el = mountReal();

    await turn(el);

    expect(lines(el)).toEqual([]);
  });

  it("draws nothing when a later round fails after one that carried usage", async () => {
    stubRuns(
      [
        { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
        { type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "read_page" },
        { type: "TOOL_CALL_ARGS", toolCallId: "c1", delta: "{}" },
        { type: "TOOL_CALL_END", toolCallId: "c1" },
        { type: "RUN_FINISHED", threadId: "t1", runId: "r1", usage: [{ inputTokens: 100 }] },
      ],
      [
        { type: "RUN_STARTED", threadId: "t1", runId: "r2" },
        { type: "RUN_ERROR", message: "boom", code: "error" },
      ],
    );
    const el = mountReal();
    el.registerTool({
      name: "read_page",
      description: "Read the page",
      parameters: { type: "object" },
      handler: () => "the page",
    });

    await turn(el);

    expect(shadow(el).querySelector(".message--failed")).not.toBeNull();
    expect(lines(el)).toEqual([]);
  });

  it("waits out an approval, then draws one line summing both runs", async () => {
    stubRuns(
      awaitingApproval([{ inputTokens: 100 }]),
      answered(2, { usage: [{ inputTokens: 50, outputTokens: 5 }] }),
    );
    const el = mountReal();

    await startTurn(el);
    expect(lines(el)).toEqual([]);
    shadow(el).querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
    await settle();

    expect(lines(el)).toEqual(["150 in · 5 out tokens"]);
  });

  it("draws nothing when Stop ends a turn that already carried usage", async () => {
    stubRuns(awaitingApproval([{ inputTokens: 100, outputTokens: 1 }]));
    const el = mountReal();

    await startTurn(el);
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await settle();

    expect(shadow(el).querySelector(".stopped-note")).not.toBeNull();
    expect(lines(el)).toEqual([]);
  });

  it("leaves a turn New chat cut off out of the next turn's count", async () => {
    stubRuns(
      awaitingApproval([{ inputTokens: 100, outputTokens: 1 }]),
      answered(2, { usage: [{ inputTokens: 7, outputTokens: 8 }] }),
    );
    const el = mountReal();

    await startTurn(el);
    el.newChat();
    await settle();
    await turn(el);

    expect(lines(el)).toEqual(["7 in · 8 out tokens"]);
  });

  it("adds up the rounds of one turn into one line", async () => {
    const call: Event[] = [
      { type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "read_page" },
      { type: "TOOL_CALL_ARGS", toolCallId: "c1", delta: "{}" },
      { type: "TOOL_CALL_END", toolCallId: "c1" },
    ];
    stubRuns(
      [
        { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
        ...call,
        { type: "RUN_FINISHED", threadId: "t1", runId: "r1", usage: [{ inputTokens: 100 }] },
      ],
      answered(2, { usage: [{ inputTokens: 200, outputTokens: 30 }] }),
    );
    const el = mountReal();
    el.registerTool({
      name: "read_page",
      description: "Read the page",
      parameters: { type: "object" },
      handler: () => "the page",
    });

    await turn(el);

    expect(lines(el)).toEqual(["300 in · 30 out tokens"]);
  });

  it("starts each turn's count afresh", async () => {
    stubRuns(
      answered(1, { usage: [{ inputTokens: 10, outputTokens: 1 }] }),
      answered(2, { usage: [{ inputTokens: 20, outputTokens: 2 }] }),
    );
    const el = mountReal();

    await turn(el);
    await turn(el);

    expect(lines(el)).toEqual(["10 in · 1 out tokens", "20 in · 2 out tokens"]);
  });

  it("follows a host's own strings", async () => {
    stubRuns(answered(1, { usage: [{ inputTokens: 1500, outputTokens: 2 }] }));
    const el = mountReal({
      "show-usage": "",
      "data-strings": JSON.stringify({ usageBoth: "{input} ein, {output} aus" }),
    });

    await turn(el);

    expect(lines(el)).toEqual(["1,500 ein, 2 aus"]);
  });
});
