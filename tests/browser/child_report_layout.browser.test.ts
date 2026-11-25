/**
 * A child's report card in a real layout, at the narrow end.
 *
 * The card is a new block in the transcript and its link a new line in it, so
 * each is measured against the transcript rather than checked for display. The
 * card is built through the real chat from the producer's recorded frame, once
 * as recorded and once with an agent name no narrow panel can hold in one line.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../../src/core/conversation_store.js";
import { defineChat } from "../../src/core/define_chat.js";
import fixture from "../fixtures/report_frame.json";

const LONG_NAME = "a_helper_agent_whose_name_has_no_break_and_runs_past_a_narrow_panel";

function frame(agent: string): Message[] {
  const stored = JSON.stringify(fixture.delivered.stored).replaceAll("helper", agent);
  return [
    { id: "u1", role: "user", content: "hi" },
    ...(JSON.parse(stored) as Message[]),
  ] as Message[];
}

function store(messages: readonly Message[]): ClientConversationStore {
  return {
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: () => Promise.resolve(messages),
    saveMessages: () => {},
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

async function mount(width: string, agent: string): Promise<AgUiChat> {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  el.style.setProperty("--ag-ui-width", width);
  el.conversationStore = store(frame(agent));
  document.body.appendChild(el);
  await settle();
  return el;
}

function all(el: AgUiChat, selector: string): HTMLElement[] {
  return [...(el.shadowRoot?.querySelectorAll<HTMLElement>(selector) ?? [])];
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const [found] = all(el, selector);
  if (found === undefined) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

function inside(inner: DOMRect, outer: DOMRect): boolean {
  return inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
}

describe("a child's report card (real browser)", () => {
  beforeAll(() => {
    defineChat();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it.each([
    ["380px", "helper"],
    ["240px", "helper"],
    ["240px", LONG_NAME],
  ])("keeps the card and its link inside the transcript at %s for %s", async (width, agent) => {
    const el = await mount(width, agent);
    const transcript = part(el, ".messages");
    const cards = all(el, ".child-report");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const link = card.querySelector<HTMLElement>(".child-report-link");
      expect(link?.getBoundingClientRect().width).toBeGreaterThan(0);
      expect(inside(card.getBoundingClientRect(), transcript.getBoundingClientRect())).toBe(true);
      expect(
        inside(link?.getBoundingClientRect() ?? new DOMRect(), card.getBoundingClientRect()),
      ).toBe(true);
    }
    expect(transcript.scrollWidth).toBeLessThanOrEqual(transcript.clientWidth);
  });

  it("takes no room once hidden, though the card declares its own display", async () => {
    const el = await mount("380px", "helper");
    const card = part(el, ".child-report");
    expect(getComputedStyle(card).display).toBe("flex");
    card.hidden = true;
    expect(getComputedStyle(card).display).toBe("none");
  });
});
