import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

/**
 * The row of controls in the header, and the More menu the optional ones move
 * into when the row has no room for them or would pass its cap.
 *
 * Chromium because each assertion is a used width, a resolved colour or real
 * focus: happy-dom lays nothing out and reports the same agreeable answer
 * whether the row is even, crowded or overflowing.
 */

/** Every shipped theme in both schemes, and a word of the host's own (which adds no rules). */
const THEMES = ["", "quiet", "soft", "ledger", "classic", "modern"].flatMap((name) => [
  name,
  `${name} dark`.trim(),
]);

const EVERY = [
  "skills",
  "routines",
  "history",
  "checkpoints",
  "new",
  "theme",
  "maximize",
  "collapse",
];

function mount(width?: string, extra: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "floating");
  el.setAttribute("title-text", "Admin Copilot");
  el.setAttribute("data-start-open", "");
  // Every control the header can carry, so the row is measured at its fullest.
  el.setAttribute("data-theme-toggle", "");
  el.setAttribute("data-runs-url", "/runs/");
  el.setAttribute("data-skill-editor-url", "/skills/editor/");
  el.setAttribute("data-skill-editor-button", "");
  el.setAttribute("data-routines-url", "/routines/");
  for (const [name, value] of Object.entries(extra)) {
    el.setAttribute(name, value);
  }
  if (width !== undefined) {
    el.style.setProperty("--ag-ui-width", width);
  }
  document.body.appendChild(el);
  return el;
}

function root(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function inline(el: AgUiChat): HTMLElement[] {
  return [...root(el).querySelectorAll<HTMLElement>(".header-controls > .header-btn")];
}

function control(el: AgUiChat, name: string): HTMLButtonElement {
  return root(el).querySelector(`.header-btn--${name}`) as HTMLButtonElement;
}

function menu(el: AgUiChat): HTMLElement {
  return root(el).querySelector(".header-menu") as HTMLElement;
}

/** Let a resize the header observes reach the row before it is measured. */
async function settle(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

describe("header controls (real browser)", () => {
  beforeAll(() => {
    defineChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it.each(["480px", "380px", "300px", "240px"])(
    "keeps the row even, apart, inside the header and at most four beside More at %s",
    async (width) => {
      const el = mount(width);
      await settle();
      const header = root(el).querySelector(".header") as HTMLElement;
      const box = header.getBoundingClientRect();
      const boxes = inline(el).map((b) => b.getBoundingClientRect());

      expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1);
      expect(inline(el).filter((b) => !b.matches(".header-btn--more")).length).toBeLessThanOrEqual(
        4,
      );
      expect(new Set(boxes.map((b) => Math.round(b.width))).size).toBe(1);
      expect(Math.round(boxes[0]?.width ?? 0)).toBe(Math.round(boxes[0]?.height ?? 0));
      for (let i = 1; i < boxes.length; i += 1) {
        expect((boxes[i]?.left ?? 0) - (boxes[i - 1]?.right ?? 0)).toBeGreaterThanOrEqual(3);
      }
      for (const rect of boxes) {
        expect(rect.left).toBeGreaterThanOrEqual(box.left - 1);
        expect(rect.right).toBeLessThanOrEqual(box.right + 1);
      }
      // The title keeps a readable share of the row.
      expect(
        (root(el).querySelector(".header-title") as HTMLElement).clientWidth,
      ).toBeGreaterThanOrEqual(64);
    },
  );

  it("reaches every control at 240px, each in the row or in the opened menu, inside the panel", async () => {
    const el = mount("240px");
    await settle();
    control(el, "more").dispatchEvent(new MouseEvent("click", { detail: 1 }));
    const panel = (root(el).querySelector(".chat") as HTMLElement).getBoundingClientRect();

    for (const name of EVERY) {
      const button = control(el, name);
      expect(button, name).not.toBeNull();
      expect(button.closest(".header-controls, .header-menu"), name).not.toBeNull();
      const rect = button.getBoundingClientRect();
      expect(rect.width, name).toBeGreaterThan(20);
      expect(rect.left, name).toBeGreaterThanOrEqual(panel.left);
      expect(rect.right, name).toBeLessThanOrEqual(panel.right);
      expect(rect.bottom, name).toBeLessThanOrEqual(panel.bottom);
    }
    // New chat and the window controls never move.
    for (const name of ["new", "maximize", "collapse"]) {
      expect(control(el, name).parentElement?.className).toBe("header-controls");
    }
    // A row in the menu shows its name beside its glyph.
    expect(getComputedStyle(control(el, "skills"), "::after").content).toBe('"Skills"');
  });

  it("gives a menu row's name a box tall enough for its descenders under every theme", async () => {
    for (const theme of THEMES) {
      const el = mount("240px", theme === "" ? {} : { theme });
      await settle();
      control(el, "more").dispatchEvent(new MouseEvent("click", { detail: 1 }));
      const label = getComputedStyle(control(el, "theme"), "::after");

      expect(label.overflow, theme).toBe("hidden");
      expect(Number.parseFloat(label.height), theme).toBeGreaterThanOrEqual(
        Number.parseFloat(label.fontSize) * 1.2,
      );
      el.remove();
    }
  });

  it("shows a row of five that fits without a More button", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "floating");
    el.setAttribute("data-start-open", "");
    el.setAttribute("data-runs-url", "/runs/");
    el.style.setProperty("--ag-ui-width", "480px");
    document.body.appendChild(el);
    await settle();

    expect(inline(el).map((b) => b.className.replace("header-btn header-btn--", ""))).toEqual([
      "history",
      "checkpoints",
      "new",
      "maximize",
      "collapse",
    ]);
    expect(control(el, "more")).toBeNull();
  });

  it("moves controls back into the row as the panel widens", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "floating");
    el.setAttribute("data-start-open", "");
    el.setAttribute("data-runs-url", "/runs/");
    el.setAttribute("title-text", "A rather long assistant title");
    el.style.setProperty("--ag-ui-width", "240px");
    document.body.appendChild(el);
    await settle();
    expect(menu(el).childElementCount).toBeGreaterThan(0);

    el.style.setProperty("--ag-ui-width", "520px");
    await settle();
    expect(menu(el).childElementCount).toBe(0);
    expect(control(el, "more")).toBeNull();
  });

  it("is driven by the keyboard and named for a screen reader", async () => {
    const el = mount("240px");
    await settle();
    const more = control(el, "more");
    more.focus();

    await userEvent.keyboard("{Enter}");
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(more.getAttribute("aria-haspopup")).toBe("menu");
    expect(menu(el).getAttribute("role")).toBe("menu");
    const items = [...menu(el).children] as HTMLElement[];
    expect(items.map((i) => i.getAttribute("role"))).toEqual(items.map(() => "menuitem"));
    expect(root(el).activeElement).toBe(items[0]);

    await userEvent.keyboard("{ArrowDown}");
    expect(root(el).activeElement).toBe(items[1]);
    await userEvent.keyboard("{End}");
    expect(root(el).activeElement).toBe(items[items.length - 1]);
    await userEvent.keyboard("{Escape}");
    expect(menu(el).hidden).toBe(true);
    expect(root(el).activeElement).toBe(more);

    await userEvent.keyboard("{ArrowUp}");
    expect(root(el).activeElement).toBe(items[items.length - 1]);
    await userEvent.keyboard("{Tab}");
    expect(menu(el).hidden).toBe(true);
  });

  it("keeps the imperative click path of a control that moved into the menu", async () => {
    const el = mount("240px");
    await settle();
    const history = control(el, "history");
    expect(history.closest(".header-menu")).not.toBeNull();

    history.click();
    expect(root(el).querySelector(".drawer")?.hasAttribute("hidden")).toBe(false);
  });

  it("sits outside the drag handle, in the panel's ink and background under any header colour and theme", async () => {
    for (const theme of THEMES) {
      const el = mount("240px", theme === "" ? {} : { theme });
      el.style.setProperty("--ag-ui-header-fg", "rgb(255, 255, 255)");
      el.style.setProperty("--ag-ui-header-bg", "rgb(20, 60, 160)");
      await settle();
      control(el, "more").dispatchEvent(new MouseEvent("click", { detail: 1 }));
      const header = root(el).querySelector(".header") as HTMLElement;

      expect(header.contains(menu(el))).toBe(false);
      const item = menu(el).firstElementChild as HTMLElement;
      expect(getComputedStyle(item).color, theme).not.toBe("rgb(255, 255, 255)");
      expect(getComputedStyle(item).color, theme).toBe(getComputedStyle(menu(el)).color);
      expect(getComputedStyle(item).backgroundColor, theme).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(menu(el)).backgroundColor, theme).not.toBe(
        getComputedStyle(header).backgroundColor,
      );
      el.remove();
    }
  });

  it("keeps focus on Maximize through the refit its Enter causes", async () => {
    const el = mount("380px");
    await settle();
    const maximize = control(el, "maximize");
    maximize.focus();
    await userEvent.keyboard("{Enter}");
    await settle();

    expect(root(el).activeElement).toBe(maximize);
    el.remove();
  });

  it("hands focus to More when the focused control moves into the closed menu", async () => {
    const el = mount("600px");
    await settle();
    const history = control(el, "history");
    expect(history.closest(".header-menu")).toBeNull();
    history.focus();
    el.style.setProperty("--ag-ui-width", "240px");
    await settle();

    expect(history.closest(".header-menu")).not.toBeNull();
    expect(root(el).activeElement).toBe(control(el, "more"));
  });

  it("keeps focus on an item of the open menu through a refit", async () => {
    const el = mount("240px");
    await settle();
    control(el, "more").dispatchEvent(new MouseEvent("click", { detail: 1 }));
    const item = menu(el).querySelector(".header-btn") as HTMLButtonElement;
    item.focus();
    el.style.setProperty("--ag-ui-width", "250px");
    await settle();

    expect(root(el).activeElement).toBe(item);
  });

  it("leaves focus inside an embedded view alone through a refit", async () => {
    const el = mount("600px");
    await settle();
    const frame = document.createElement("iframe");
    frame.srcdoc = "<input id='i'>";
    const loaded = new Promise((resolve) => frame.addEventListener("load", resolve));
    (root(el).querySelector(".chat") as HTMLElement).append(frame);
    await loaded;
    const doc = frame.contentDocument as Document;
    (doc.getElementById("i") as HTMLInputElement).focus();
    expect(root(el).activeElement).toBe(frame);
    el.style.setProperty("--ag-ui-width", "240px");
    await settle();

    expect(doc.activeElement?.id).toBe("i");
  });

  it("stays on screen over a full-panel view", async () => {
    const el = mount("240px");
    await settle();
    const chat = root(el).querySelector(".chat") as HTMLElement;
    chat.setAttribute("data-panel-view", "");
    control(el, "more").dispatchEvent(new MouseEvent("click", { detail: 1 }));

    expect(getComputedStyle(menu(el)).display).toBe("flex");
  });

  it("takes a host's size for them", () => {
    const el = mount();
    el.style.setProperty("--ag-ui-header-btn-size", "40px");

    expect(Math.round(inline(el)[0]?.getBoundingClientRect().width ?? 0)).toBe(40);
  });
});
