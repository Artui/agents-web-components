import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
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

function option(value: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = value;
  return choice;
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

  it.each(["", "dark", "classic", "classic dark", "ledger", "ledger dark"])(
    "draws each weekday as a pill a key toggles, filled when chosen, under theme '%s'",
    async (theme) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => answer(String(url))),
      );
      const el = mount("380px");
      if (theme !== "") {
        el.setAttribute("theme", theme);
      }
      await settle();
      part(el, ".header-btn--routines").click();
      await settle();
      part(el, ".header-btn--new-routine").click();
      await settle();
      const [monday, , , , , saturday] = all(el, "[part=routine-day]");
      const sat = (saturday as HTMLElement).querySelector("input") as HTMLInputElement;
      const box = sat.getBoundingClientRect();
      expect(box.width * box.height).toBeLessThanOrEqual(1);
      const off = getComputedStyle(saturday as HTMLElement).backgroundColor;
      expect(getComputedStyle(monday as HTMLElement).backgroundColor).not.toBe(off);
      sat.focus();
      expect(el.shadowRoot?.activeElement).toBe(sat);
      await userEvent.keyboard(" ");
      expect(sat.checked).toBe(true);
      expect(getComputedStyle(saturday as HTMLElement).backgroundColor).not.toBe(off);
      expect(getComputedStyle(saturday as HTMLElement).outlineStyle).toBe("solid");
    },
  );

  async function openForm(el: AgUiChat, existing: boolean): Promise<void> {
    await settle();
    part(el, ".header-btn--routines").click();
    await settle();
    part(el, existing ? ".routine-row .skill-row-open" : ".header-btn--new-routine").click();
    await settle();
  }

  it("pins each weekday's hidden checkbox out of flow, so the label sits on the pill's padding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => answer(String(url))),
    );
    const el = mount("380px");
    await openForm(el, false);
    for (const chip of all(el, "[part=routine-day]")) {
      const text = [...chip.childNodes].find((node) => node.nodeType === Node.TEXT_NODE) as Text;
      const range = document.createRange();
      range.selectNodeContents(text);
      const style = getComputedStyle(chip);
      const inner = chip.getBoundingClientRect().left + Number.parseFloat(style.borderLeftWidth);
      const padding = Number.parseFloat(style.paddingLeft);
      expect(range.getBoundingClientRect().left - inner).toBeCloseTo(padding, 0);
      expect(chip.scrollWidth).toBe(chip.clientWidth);
    }
  });

  it.each(["", "dark", "ledger dark"])(
    "draws the time as two themed selects, no native time popup, under theme '%s'",
    async (theme) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => answer(String(url))),
      );
      const el = mount("380px");
      if (theme !== "") {
        el.setAttribute("theme", theme);
      }
      await openForm(el, true);
      expect(all(el, "input[type=time]")).toHaveLength(0);
      const group = part(el, ".routine-time");
      expect(group.getAttribute("role")).toBe("group");
      const labelled = part(el, `#${group.getAttribute("aria-labelledby")}`);
      expect(labelled.textContent).toBe("At");
      const [hour, minute] = all(el, ".routine-time select") as HTMLSelectElement[];
      expect([hour?.value, minute?.value]).toEqual(["08", "00"]);
      const zone = part(el, "#routine-field-timezone");
      const panel = getComputedStyle(part(el, ".panel-view"));
      for (const select of [hour, minute] as HTMLSelectElement[]) {
        const style = getComputedStyle(select);
        expect(style.colorScheme).toBe(panel.colorScheme);
        expect(style.backgroundColor).toBe(getComputedStyle(zone).backgroundColor);
        expect(style.color).toBe(panel.color);
        expect(
          inside(select.getBoundingClientRect(), part(el, ".routine-form").getBoundingClientRect()),
        ).toBe(true);
      }
      expect(theme.includes("dark") ? "dark" : "light").toBe(panel.colorScheme);
    },
  );

  it("changes the time and the zone from the keyboard alone and saves 'HH:MM'", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => answer(String(url)));
    vi.stubGlobal("fetch", fetch);
    const el = mount("380px");
    await openForm(el, true);
    expect(all(el, ".routine-time select")).toHaveLength(2);
    const [hour, minute] = all(el, ".routine-time select") as HTMLSelectElement[];
    (hour as HTMLSelectElement).focus();
    await userEvent.keyboard("1");
    expect(el.shadowRoot?.activeElement).toBe(hour);
    await userEvent.keyboard("{Tab}");
    expect(el.shadowRoot?.activeElement).toBe(minute);
    await userEvent.keyboard("3");
    await userEvent.keyboard("{Tab}");
    const zone = part(el, "#routine-field-timezone") as HTMLInputElement;
    expect(el.shadowRoot?.activeElement).toBe(zone);
    await userEvent.keyboard("Asia/Tokyo");
    expect([hour?.value, minute?.value, zone.value]).toEqual(["10", "30", "Asia/Tokyo"]);
    all(el, ".panel-view-footer button")
      .find((button) => button.textContent === "Save")
      ?.click();
    await settle();
    const write = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
      schedule: { kind: "weekly", at: "10:30" },
      timezone: "Asia/Tokyo",
    });
  });

  it("projects a plain select slotted as routine-time or routine-timezone, writes the routine in, saves its value", async () => {
    const fetch = vi.fn(async (url: string, _init?: RequestInit) => answer(String(url)));
    vi.stubGlobal("fetch", fetch);
    const el = mount("380px");
    const time = document.createElement("select");
    time.slot = "routine-time";
    time.setAttribute("aria-label", "Run at");
    const zone = document.createElement("select");
    zone.slot = "routine-timezone";
    zone.setAttribute("aria-label", "Zone");
    for (const [control, values] of [
      [time, ["07:00", "08:00", "19:30"]],
      [zone, ["UTC", "Europe/Paris", "America/New_York"]],
    ] as const) {
      for (const value of values) {
        control.append(option(value));
      }
      control.value = values[0];
      el.append(control);
    }
    await openForm(el, true);
    expect([time.value, zone.value]).toEqual(["08:00", "Europe/Paris"]);
    expect(time.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(
      inside(time.getBoundingClientRect(), part(el, ".routine-form").getBoundingClientRect()),
    ).toBe(true);
    expect(all(el, ".routine-time select")[0]?.getBoundingClientRect().width).toBe(0);
    time.focus();
    await userEvent.keyboard("1");
    zone.value = "America/New_York";
    zone.dispatchEvent(new Event("change", { bubbles: true }));
    all(el, ".panel-view-footer button")
      .find((button) => button.textContent === "Save")
      ?.click();
    await settle();
    const write = fetch.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(JSON.parse(String(write?.[1]?.body))).toMatchObject({
      schedule: { kind: "weekly", at: "19:30" },
      timezone: "America/New_York",
    });
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
