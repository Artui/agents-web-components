import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

defineChat();

const original = globalThis.fetch;
const encoder = new TextEncoder();

afterEach(() => {
  globalThis.fetch = original;
  document.body.replaceChildren();
  sessionStorage.clear();
});

/** A run that streams its start and then holds the request open until it is aborted. */
function streamUntilAborted(): void {
  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError")),
            );
            const started = { type: "RUN_STARTED", threadId: "x", runId: "r" };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(started)}\n\n`));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      ),
    )) as typeof fetch;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("<ag-ui-chat> put back on another endpoint mid-run", () => {
  it("writes nothing of the run it left under the next endpoint's namespace", async () => {
    streamUntilAborted();
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    chat.setAttribute("endpoint", "/one/");
    document.body.append(chat);
    await settle();
    const thread = chat.threadId as string;
    void chat.sendMessage("a long one");
    await expect.poll(() => chat.hasAttribute("data-running")).toBe(true);

    chat.remove();
    chat.setAttribute("endpoint", "/two/");
    document.body.append(chat);
    await settle();

    const naming = Object.keys(sessionStorage).filter(
      (key) =>
        key.includes("/two/") &&
        (key.includes(thread) || (sessionStorage.getItem(key) ?? "").includes(thread)),
    );
    expect(naming).toEqual([]);
    expect(
      Object.keys(sessionStorage).some((key) => key.includes(`/one/:messages:${thread}`)),
    ).toBe(true);
  });
});
