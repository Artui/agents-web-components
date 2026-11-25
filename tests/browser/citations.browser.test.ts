import type { Message } from "@ag-ui/core";
import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../../src/core/conversation_store.js";
import { defineChat } from "../../src/core/define_chat.js";

/**
 * A cited answer's sources in a real engine: what lands in the DOM from a
 * hostile citation (happy-dom cannot be trusted to say), and whether the list
 * stays inside its bubble at a narrow width.
 */

const LONG = `https://example.com/${"a".repeat(300)}`;

function seeded(messages: readonly Message[]): ClientConversationStore {
  return {
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> => Promise.resolve(messages),
    saveMessages: () => {},
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

async function reloaded(citations: unknown, width = 320): Promise<ShadowRoot> {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-start-open", "");
  el.style.width = `${width}px`;
  el.style.height = "600px";
  el.conversationStore = seeded([
    { id: "u1", role: "user", content: "hi" },
    { id: "a1", role: "assistant", content: "it is blue", metadata: { citations } } as Message,
  ]);
  document.body.append(el);
  await flush();
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

describe("the sources under a cited answer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    defineChat();
  });

  it("puts a hostile title, URL or excerpt in as text, never as markup or a link", async () => {
    const root = await reloaded([
      {
        sources: [
          {
            kind: "web",
            url: "javascript:alert(1)",
            title: '<img src=x onerror="window.__cited=1">',
            excerpts: ["<script>window.__cited=2</script><b>bold</b>"],
          },
          { kind: "web", url: "data:text/html,<p>x</p>", title: "D", excerpts: [] },
        ],
        anchor: { kind: "content", start: 6, end: 10 },
      },
    ]);
    root.querySelector<HTMLDetailsElement>(".citations")?.setAttribute("open", "");
    await flush();

    const list = root.querySelector(".citations");
    expect(list?.querySelectorAll("a, img, script, b")).toHaveLength(0);
    expect(list?.querySelector(".citation-title")?.textContent).toBe(
      '<img src=x onerror="window.__cited=1">',
    );
    expect(list?.querySelector(".citation-excerpt")?.textContent).toContain("<script>");
    expect((window as { __cited?: number }).__cited).toBeUndefined();
  });

  it("keeps an opened list inside its bubble at a narrow width, a long URL included", async () => {
    const root = await reloaded([
      {
        sources: [{ kind: "web", url: LONG, title: null, excerpts: ["x".repeat(400)] }],
        anchor: { kind: "content", start: 6, end: 10 },
      },
    ]);
    const details = root.querySelector<HTMLDetailsElement>(".citations");
    const summary = root.querySelector<HTMLElement>(".citations-summary");
    expect(details?.open).toBe(false);
    // Collapsed at rest: the list takes no more height than its summary.
    expect(details?.getBoundingClientRect().height).toBeLessThan(
      (summary?.getBoundingClientRect().height ?? 0) + 12,
    );
    summary?.click();
    await flush();

    const bubble = root.querySelector<HTMLElement>(".message--assistant")?.getBoundingClientRect();
    expect(details?.open).toBe(true);
    for (const part of root.querySelectorAll<HTMLElement>(
      ".citations, .citation-title, .citation-excerpt, .citation-anchor",
    )) {
      const box = part.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual((bubble?.left ?? 0) - 0.5);
      expect(box.right).toBeLessThanOrEqual((bubble?.right ?? 0) + 0.5);
    }
  });
});
