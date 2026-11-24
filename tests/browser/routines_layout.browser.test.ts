import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type { ClientConversationStore, ThreadMeta } from "../../src/core/conversation_store.js";
import { defineChat } from "../../src/core/define_chat.js";
import recorded from "../fixtures/routines.json";

const LONG = "A routine whose name runs well past the width of a narrow panel, twice over";

const THREADS: readonly ThreadMeta[] = [
  {
    threadId: "fired",
    title: "Standup",
    updatedAt: Date.now(),
    preview: "Ran by itself",
    routine: { id: "1", name: LONG },
  },
];

function store(): ClientConversationStore {
  return {
    threadId: () => "typed",
    setActiveThread: () => {},
    loadMessages: () => Promise.resolve(null),
    saveMessages: () => {},
    loadCheckpoint: () => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: () => Promise.resolve(THREADS),
    renameThread: () => {},
  };
}

function answer(url: string): Response {
  const body = url.endsWith("/runs/")
    ? recorded.answers.runsFinished.body
    : {
        ...recorded.answers.list.body,
        routines: recorded.answers.list.body.routines.map((routine, index) =>
          index === 0 ? { ...routine, name: LONG } : routine,
        ),
      };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function mount(width: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-routines-url", "/agent/routines/");
  el.style.setProperty("--ag-ui-width", width);
  el.conversationStore = store();
  document.body.appendChild(el);
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
  return (
    inner.left >= outer.left - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.bottom <= outer.bottom + 0.5
  );
}

describe("routines (real browser)", () => {
  beforeAll(() => {
    defineChat();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it.each(["380px", "240px"])(
    "draws the list over the transcript, each row's actions inside its row, at %s",
    async (width) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => answer(String(url))),
      );
      const el = mount(width);
      await settle();
      part(el, ".header-btn--routines").click();
      await settle();
      expect(getComputedStyle(part(el, ".messages-wrap")).display).toBe("none");
      const chat = part(el, ".chat").getBoundingClientRect();
      const rows = all(el, ".routine-row");
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        expect(box.width).toBeGreaterThan(0);
        expect(inside(box, chat)).toBe(true);
        const controls = [...row.querySelectorAll<HTMLElement>(".routine-actions > *")];
        expect(controls.length).toBeGreaterThanOrEqual(3);
        for (const control of controls) {
          const rect = control.getBoundingClientRect();
          expect(rect.width).toBeGreaterThan(0);
          expect(inside(rect, box)).toBe(true);
        }
        for (const line of row.querySelectorAll<HTMLElement>(".routine-schedule, .routine-next")) {
          expect(inside(line.getBoundingClientRect(), box)).toBe(true);
        }
      }
    },
  );

  it("keeps the destructive grant's confirmation inside the form at 240px", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => answer(String(url))),
    );
    const el = mount("240px");
    await settle();
    part(el, ".header-btn--routines").click();
    await settle();
    part(el, ".header-btn--new-routine").click();
    await settle();
    const box = part(el, ".routine-tool:has(input[name='drop_table']) input");
    box.click();
    await settle();
    const confirm = part(el, ".routine-tool:has(input[name='drop_table']) .routine-confirm");
    const rect = confirm.getBoundingClientRect();
    expect(rect.height).toBeGreaterThan(0);
    expect(inside(rect, part(el, ".routine-form").getBoundingClientRect())).toBe(true);
    for (const button of confirm.querySelectorAll<HTMLElement>("button")) {
      expect(inside(button.getBoundingClientRect(), rect)).toBe(true);
    }
  });

  it("badges a routine's run in the drawer without pushing the row's actions out, at 240px", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => answer(String(url))),
    );
    const el = mount("240px");
    await settle();
    part(el, ".header-btn--history").click();
    await settle();
    const row = part(el, ".drawer-row").getBoundingClientRect();
    const badge = part(el, "[part=drawer-row-routine]");
    expect(badge.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(badge.getBoundingClientRect().height).toBeLessThan(24);
    expect(
      inside(badge.getBoundingClientRect(), part(el, ".drawer-row-select").getBoundingClientRect()),
    ).toBe(true);
    for (const action of all(el, ".drawer-row-rename, .drawer-row-delete")) {
      expect(inside(action.getBoundingClientRect(), row)).toBe(true);
    }
  });
});
