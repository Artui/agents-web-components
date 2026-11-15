import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

/**
 * The new-conversation offer under a failed run and the usage line under a
 * finished one, measured: each must sit inside the transcript at a cramped
 * width, at its own width rather than stretched across the column.
 */

const CRAMPED = "240px";

function sse(events: readonly Record<string, unknown>[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function stubRun(events: readonly Record<string, unknown>[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.body === undefined
        ? new Response(JSON.stringify({ runs: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : sse(events),
    ),
  );
}

async function run(attrs: Record<string, string>): Promise<ShadowRoot> {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.style.width = CRAMPED;
  el.style.height = "480px";
  document.body.appendChild(el);
  await el.sendMessage("go");
  await vi.waitFor(() => {
    expect(el.shadowRoot?.querySelector(".send")?.getAttribute("data-state")).not.toBe("running");
  });
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function inside(child: Element, root: ShadowRoot): void {
  const box = (root.querySelector(".messages") as HTMLElement).getBoundingClientRect();
  const rect = child.getBoundingClientRect();
  expect(rect.width).toBeGreaterThan(0);
  expect(rect.left).toBeGreaterThanOrEqual(box.left);
  expect(rect.right).toBeLessThanOrEqual(box.right + 0.5);
  // At its own width: a stretched child would span the column's content box.
  expect(rect.width).toBeLessThan(box.width - 40);
}

beforeAll(() => {
  defineChat();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("a run's outcome lines", () => {
  it("lays the new-conversation offer out as a chip inside the transcript", async () => {
    stubRun([
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
      { type: "RUN_ERROR", message: "thread_id is too long", code: "identifier_too_long" },
    ]);
    const root = await run({});

    const offer = root.querySelector(".run-error-offer") as HTMLElement;
    await vi.waitFor(() => {
      expect(offer.getBoundingClientRect().height).toBeGreaterThan(0);
    });
    inside(offer, root);
    expect(getComputedStyle(offer).borderTopLeftRadius).toBe("999px");
  });

  it("draws the usage line muted and small, at its own width", async () => {
    stubRun([
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
      { type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: "An answer." },
      { type: "TEXT_MESSAGE_END", messageId: "a1" },
      {
        type: "RUN_FINISHED",
        threadId: "t1",
        runId: "r1",
        usage: [{ inputTokens: 1234, outputTokens: 567 }],
      },
    ]);
    const root = await run({ "show-usage": "" });

    const line = root.querySelector(".usage-line") as HTMLElement;
    inside(line, root);
    expect(getComputedStyle(line).fontSize).toBe("12px");
    const answer = root.querySelector(".message--assistant") as HTMLElement;
    expect(getComputedStyle(line).color).not.toBe(getComputedStyle(answer).color);
  });
});
