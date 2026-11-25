/**
 * A cited answer, live and after a reload, over the real `HttpAgent`.
 *
 * The bodies and the stored messages are `tests/fixtures/citations.json`, which
 * `scripts/record_citations_fixture.py` records from django-ag-ui's own session:
 * its SSE as it streamed and the conversation its store was handed. The two
 * copies of a file-split answer differ -- two messages live, one joined message
 * stored under a fresh id -- and each copy's citations index its own text, so
 * each is read against the text it came with.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, FEEDBACK_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineChat } from "../src/core/define_chat.js";
import type { FeedbackDetail } from "../src/core/events/feedback_detail.js";
import fixture from "./fixtures/citations.json";

defineChat();

type RunName = keyof typeof fixture.runs;

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function store(seed: readonly Message[]): ClientConversationStore {
  let saved = JSON.parse(JSON.stringify(seed)) as readonly Message[];
  return {
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : saved),
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = messages;
    },
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function mount(seed: readonly Message[] = []): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-message-actions", "copy,feedback");
  el.conversationStore = store(seed);
  document.body.appendChild(el);
  return el;
}

/** Stream `run`'s recorded body as the answer to the next request. */
async function live(run: RunName): Promise<AgUiChat> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(fixture.runs[run].sse, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    ),
  );
  const el = mount();
  await settle();
  await el.sendMessage("hi");
  await settle();
  return el;
}

/** Reload `run`'s stored conversation into a fresh element. */
async function reloaded(run: RunName): Promise<AgUiChat> {
  const user: Message = { id: "u1", role: "user", content: "hi" };
  const el = mount([user, ...(fixture.runs[run].stored as unknown as Message[])]);
  await settle();
  return el;
}

/** Each assistant bubble as its text, the quoted anchors and the source titles under it. */
function answers(el: AgUiChat): { quotes: string[]; sources: string[] }[] {
  return Array.from(shadow(el).querySelectorAll(".message--assistant")).map((bubble) => ({
    quotes: Array.from(bubble.querySelectorAll(".citation-anchor")).map((q) => q.textContent),
    sources: Array.from(bubble.querySelectorAll(".citation-title")).map((t) => t.textContent),
  }));
}

/** The message id each assistant bubble's thumbs-up files its rating under. */
function ratingIds(el: AgUiChat): string[] {
  const seen: string[] = [];
  el.addEventListener(FEEDBACK_EVENT, (e) =>
    seen.push((e as CustomEvent<FeedbackDetail>).detail.messageId),
  );
  for (const up of shadow(el).querySelectorAll<HTMLButtonElement>(".message-action--up")) {
    up.click();
  }
  return seen;
}

describe("a cited answer", () => {
  it("quotes each anchored range under the answer, live", async () => {
    const el = await live("cited");

    // The content anchor and the marker are read past an astral character,
    // which is two UTF-16 units: an offset counted in code points lands one
    // unit early and quotes " blu" and " [1" instead.
    expect(answers(el)).toEqual([
      { quotes: ["blue", "[1]"], sources: ["Sky", "Field notes", "Sky", "Field notes"] },
    ]);
    const summary = shadow(el).querySelector(".citations-summary");
    expect(summary?.textContent).toBe("Sources (3)");
    expect(shadow(el).querySelector(".citation-anchor--marker")?.tagName).toBe("CODE");
  });

  it("draws the same list from the stored copy after a reload", async () => {
    const el = await reloaded("cited");

    expect(answers(el)).toEqual([
      { quotes: ["blue", "[1]"], sources: ["Sky", "Field notes", "Sky", "Field notes"] },
    ]);
  });

  it("links a web source and leaves a document source as text", async () => {
    const el = await live("cited");

    const link = shadow(el).querySelector<HTMLAnchorElement>("a.citation-title");
    expect(link?.href).toBe("https://example.com/sky");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(link?.target).toBe("_blank");
    expect(shadow(el).querySelector(".citation-excerpt")?.textContent).toBe("The sky is blue.");
    expect(shadow(el).querySelector("span.citation-title")?.textContent).toBe("Field notes");
  });

  it("leaves the sources out of what Copy and a rating carry", async () => {
    const el = await live("cited");
    const seen: FeedbackDetail[] = [];
    el.addEventListener(FEEDBACK_EVENT, (e) =>
      seen.push((e as CustomEvent<FeedbackDetail>).detail),
    );

    shadow(el).querySelector<HTMLButtonElement>(".message-action--up")?.click();

    expect(seen.map((d) => d.content)).toEqual(["\u{1d400} sky: it is blue [1]"]);
  });
});

describe("an answer split around a file part", () => {
  it("draws two bubbles live, each citing into its own text and rated by its streamed id", async () => {
    const el = await live("fileSplit");

    expect(answers(el)).toEqual([
      { quotes: ["is"], sources: ["Sky"] },
      { quotes: ["too"], sources: ["Field notes"] },
    ]);
    expect(ratingIds(el)).toEqual(["m0", "m1"]);
  });

  it("draws one bubble after a reload, citing into the joined text, rated by the stored id", async () => {
    const el = await reloaded("fileSplit");

    // The stored offsets index "B is\nC too": read against either streamed
    // half they would quote "s\n" or nothing.
    expect(answers(el)).toEqual([{ quotes: ["is", "too"], sources: ["Sky", "Field notes"] }]);
    expect(ratingIds(el)).toEqual(["m2"]);
  });
});

describe("an answer split around reasoning", () => {
  it("is rated under the ids it streamed under, live and after a reload", async () => {
    const liveEl = await live("reasoningSplit");
    const liveIds = ratingIds(liveEl);
    document.body.innerHTML = "";
    const restored = await reloaded("reasoningSplit");

    expect(liveIds).toEqual(["m0", "m2"]);
    expect(ratingIds(restored)).toEqual(liveIds);
    expect(answers(restored)).toEqual([
      { quotes: ["part"], sources: ["Sky"] },
      { quotes: [], sources: [] },
    ]);
  });
});
