import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, THREAD_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

defineChat();

const TOO_LONG = "thread_id is 300 characters; the limit is 255.";

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function sse(events: readonly Record<string, unknown>[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** Answer every run POST with `respond()`, and the history reads with an empty list. */
function stubRuns(respond: () => Response): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.body === undefined
        ? new Response(JSON.stringify({ runs: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        : respond(),
    ),
  );
}

/** A run that fails with `RUN_ERROR`, carrying `extra` (its code, when there is one). */
function failingRun(message: string, extra: Record<string, unknown> = {}): () => Response {
  return () =>
    sse([
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
      { type: "RUN_ERROR", message, ...extra },
    ]);
}

/** Mount with the element's own `HttpAgent`, so the event crosses 1.0's schema. */
function mountReal(attrs: Record<string, string> = {}): AgUiChat {
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

function failedText(el: AgUiChat): string | undefined {
  return shadow(el).querySelector(".message--failed")?.textContent?.trim();
}

function offer(el: AgUiChat): HTMLButtonElement | null {
  return shadow(el).querySelector<HTMLButtonElement>(".run-error-offer");
}

describe("a RUN_ERROR's bubble", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["timed_out", DEFAULT_UI_STRINGS.runErrorTimedOut],
    ["interrupted", DEFAULT_UI_STRINGS.runErrorInterrupted],
    ["error", DEFAULT_UI_STRINGS.runErrorFailed],
    ["a_code_from_a_newer_server", DEFAULT_UI_STRINGS.runErrorFailed],
  ])("shows the string for code %s, not the server's words, and no offer", async (code, text) => {
    stubRuns(failingRun("The run failed. The failure has been recorded.", { code }));
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe(`⚠️ ${text}`);
    expect(offer(el)).toBeNull();
  });

  it("keeps the server's message when it sent no code, with no offer", async () => {
    stubRuns(failingRun("The upstream model is overloaded"));
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe("⚠️ The upstream model is overloaded");
    expect(offer(el)).toBeNull();
  });

  it("shows a host's own string for a code", async () => {
    stubRuns(failingRun("boom", { code: "timed_out" }));
    const el = mountReal({ "data-strings": JSON.stringify({ runErrorTimedOut: "Zu langsam." }) });

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe("⚠️ Zu langsam.");
  });

  it("shows identifier_too_long's own message, with an offer under the action row", async () => {
    stubRuns(failingRun(TOO_LONG, { code: "identifier_too_long" }));
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe(`⚠️ ${TOO_LONG}`);
    const button = offer(el);
    expect(button?.textContent).toBe(DEFAULT_UI_STRINGS.runErrorNewChat);
    expect(button?.type).toBe("button");
    expect(button?.getAttribute("part")).toBe("run-error-offer");
    expect(button?.previousElementSibling?.classList.contains("message-actions")).toBe(true);
  });

  it("puts the offer straight under the bubble when the host turned the row off", async () => {
    stubRuns(failingRun(TOO_LONG, { code: "identifier_too_long" }));
    const el = mountReal({ "data-message-actions": "" });

    await el.sendMessage("go");
    await settle();

    expect(offer(el)?.previousElementSibling?.classList.contains("message--failed")).toBe(true);
  });

  it("starts a fresh conversation when the offer is clicked", async () => {
    stubRuns(failingRun(TOO_LONG, { code: "identifier_too_long" }));
    const el = mountReal();
    await settle();
    const before = el.threadId;
    const seen: string[] = [];
    el.addEventListener(THREAD_EVENT, (event) => {
      seen.push((event as CustomEvent<{ reason: string }>).detail.reason);
    });
    await el.sendMessage("go");
    await settle();

    offer(el)?.click();
    await settle();

    expect(el.threadId).not.toBeNull();
    expect(el.threadId).not.toBe(before);
    expect(seen).toEqual(["new"]);
    expect(shadow(el).querySelectorAll(".message")).toHaveLength(0);
    expect(offer(el)).toBeNull();
  });
});

describe("a run POST the server refuses", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Pinned as it stands: @ag-ui/client throws with the status and body, which
  // the bubble shows verbatim, codes and strings untouched.
  it("shows the client's HTTP error text, with no offer", async () => {
    stubRuns(
      () =>
        new Response(JSON.stringify({ detail: "thread_id is too long" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe('⚠️ HTTP 400: {"detail":"thread_id is too long"}');
    expect(offer(el)).toBeNull();
  });

  /** A refusal whose body is `body`, sent as `contentType`. */
  function refused(body: string, contentType = "application/json"): () => Response {
    return () => new Response(body, { status: 400, headers: { "Content-Type": contentType } });
  }

  // django-ag-ui's `agui_view` refuses an over-long id before the stream opens
  // with this body, so the coded path a RUN_ERROR takes has to reach it too.
  it("shows identifier_too_long's message and the offer for a coded refusal", async () => {
    stubRuns(refused(JSON.stringify({ error: TOO_LONG, code: "identifier_too_long" })));
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe(`⚠️ ${TOO_LONG}`);
    expect(offer(el)?.textContent).toBe(DEFAULT_UI_STRINGS.runErrorNewChat);
  });

  it("shows a known code's string for a coded refusal, with no offer", async () => {
    stubRuns(refused(JSON.stringify({ error: "slow", code: "timed_out" })));
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe(`⚠️ ${DEFAULT_UI_STRINGS.runErrorTimedOut}`);
    expect(offer(el)).toBeNull();
  });

  it("falls back to the client's text for identifier_too_long with no error message", async () => {
    stubRuns(refused(JSON.stringify({ code: "identifier_too_long" })));
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe('⚠️ HTTP 400: {"code":"identifier_too_long"}');
    expect(offer(el)).not.toBeNull();
  });

  it.each([
    ["a body not sent as JSON", "Bad Request", "text/plain", "HTTP 400: Bad Request"],
    ["a code that is not a string", '{"code":7}', "application/json", 'HTTP 400: {"code":7}'],
    [
      "a JSON array",
      '["identifier_too_long"]',
      "application/json",
      'HTTP 400: ["identifier_too_long"]',
    ],
  ])("keeps the client's text for %s", async (_name, body, contentType, text) => {
    stubRuns(refused(body, contentType));
    const el = mountReal();

    await el.sendMessage("go");
    await settle();

    expect(failedText(el)).toBe(`⚠️ ${text}`);
    expect(offer(el)).toBeNull();
  });
});
