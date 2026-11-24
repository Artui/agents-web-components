import { afterEach, describe, expect, it } from "vitest";
import { headerButton } from "../src/ui/shell/header_button.js";
import { HeaderOverflow } from "../src/ui/shell/header_overflow.js";

interface Rig {
  readonly overflow: HeaderOverflow;
  readonly header: HTMLElement;
  readonly title: HTMLElement;
  readonly controls: HTMLElement;
  readonly b: Record<string, HTMLButtonElement>;
  readonly abort: AbortController;
}

const rigs: AbortController[] = [];

function rig(names: readonly string[], movable: readonly string[]): Rig {
  const header = document.createElement("div");
  const title = document.createElement("span");
  const controls = document.createElement("div");
  header.append(title, controls);
  const b: Record<string, HTMLButtonElement> = {};
  for (const name of names) {
    b[name] = headerButton(name, `${name} label`, "<svg></svg>");
  }
  const row = names.map((n) => b[n] as HTMLButtonElement);
  controls.append(...row);
  const abort = new AbortController();
  rigs.push(abort);
  const overflow = new HeaderOverflow({
    header,
    title,
    controls,
    row,
    movable: movable.map((n) => b[n] as HTMLButtonElement),
    label: "More",
    signal: abort.signal,
  });
  document.body.append(header, overflow.menu);
  overflow.fit();
  return { overflow, header, title, controls, b, abort };
}

const inRow = (r: Rig): string[] =>
  [...r.controls.children].map((c) => c.className.replace("header-btn header-btn--", ""));
const inMenu = (r: Rig): string[] =>
  [...r.overflow.menu.children].map((c) => c.className.replace("header-btn header-btn--", ""));

function key(target: Element, k: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function size(el: HTMLElement, client: number, scroll = client): void {
  Object.defineProperty(el, "clientWidth", { configurable: true, value: client });
  Object.defineProperty(el, "scrollWidth", { configurable: true, value: scroll });
}

const FULL = ["skills", "history", "checkpoints", "new", "theme", "maximize", "collapse"];
const MOVABLE = ["theme", "skills", "checkpoints", "history"];

describe("HeaderOverflow", () => {
  afterEach(() => {
    for (const abort of rigs.splice(0)) {
      abort.abort();
    }
    document.body.replaceChildren();
  });

  it("leaves a row of five alone, with no More button", () => {
    const r = rig(
      ["history", "checkpoints", "new", "maximize", "collapse"],
      ["checkpoints", "history"],
    );

    expect(inRow(r)).toEqual(["history", "checkpoints", "new", "maximize", "collapse"]);
    expect(inMenu(r)).toEqual([]);
  });

  it("moves the optional controls out first-to-go first until four stay, keeping row order in the menu", () => {
    const r = rig(FULL, MOVABLE);

    expect(inRow(r)).toEqual(["history", "new", "more", "maximize", "collapse"]);
    expect(inMenu(r)).toEqual(["skills", "checkpoints", "theme"]);
    for (const item of r.overflow.menu.children) {
      expect(item.getAttribute("role")).toBe("menuitem");
      expect(item.getAttribute("tabindex")).toBe("-1");
    }
    expect(r.overflow.trigger.getAttribute("part")).toBe("header-button more-button");
    expect(r.overflow.trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(r.overflow.menu.getAttribute("role")).toBe("menu");
    expect(r.overflow.menu.getAttribute("part")).toBe("header-menu");
  });

  it("puts More before collapse when there is no maximize", () => {
    const r = rig(["skills", "history", "checkpoints", "new", "theme", "collapse"], MOVABLE);

    expect(inRow(r)).toEqual(["history", "checkpoints", "new", "more", "collapse"]);
  });

  it("keeps a fixed control the element took out of the row out of it", () => {
    const r = rig(FULL, MOVABLE);
    r.b["maximize"]?.remove();
    r.overflow.fit();

    expect(inRow(r)).toEqual(["history", "checkpoints", "new", "more", "collapse"]);
  });

  it("moves more out while the laid-out row overflows, and brings them back when it fits", () => {
    const r = rig(["history", "checkpoints", "new", "collapse"], ["checkpoints", "history"]);
    size(r.title, 200);
    size(r.header, 240, 300);
    // The row still overflows after the first move, so both go.
    r.overflow.fit();
    expect(inMenu(r)).toEqual(["history", "checkpoints"]);
    expect(inRow(r)).toEqual(["new", "more", "collapse"]);

    size(r.header, 480);
    r.overflow.fit();
    expect(inRow(r)).toEqual(["history", "checkpoints", "new", "collapse"]);
    expect(r.b["history"]?.hasAttribute("role")).toBe(false);
    expect(r.b["history"]?.hasAttribute("tabindex")).toBe(false);
  });

  it("moves one out when the title is squeezed below its floor, and stops once it is not", () => {
    const r = rig(["history", "checkpoints", "new", "collapse"], ["checkpoints", "history"]);
    size(r.header, 240);
    // The title widens as soon as anything has left the row.
    Object.defineProperty(r.title, "clientWidth", {
      configurable: true,
      get: () => (r.overflow.menu.childElementCount === 0 ? 60 : 100),
    });
    r.overflow.fit();

    expect(inMenu(r)).toEqual(["checkpoints"]);
  });

  it("opens on More from a pointer without moving focus, and closes on a second press", () => {
    const r = rig(FULL, MOVABLE);
    r.overflow.trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

    expect(r.overflow.open).toBe(true);
    expect(r.overflow.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).not.toBe(r.b["skills"]);

    r.overflow.trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(r.overflow.open).toBe(false);
    expect(r.overflow.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("lands on the first row when opened from the keyboard", () => {
    const r = rig(FULL, MOVABLE);
    r.overflow.trigger.click();

    expect(document.activeElement).toBe(r.b["skills"]);
  });

  it("opens on the arrows from More, on the first or the last row", () => {
    const r = rig(FULL, MOVABLE);
    expect(key(r.overflow.trigger, "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(r.b["skills"]);

    r.overflow.close();
    key(r.overflow.trigger, "ArrowUp");
    expect(document.activeElement).toBe(r.b["theme"]);

    r.overflow.close();
    expect(key(r.overflow.trigger, "Enter").defaultPrevented).toBe(false);
    expect(r.overflow.open).toBe(false);
  });

  it("moves between rows with the arrows, Home and End, wrapping at the ends", () => {
    const r = rig(FULL, MOVABLE);
    r.overflow.show(true);
    const skills = r.b["skills"] as HTMLButtonElement;

    key(skills, "ArrowDown");
    expect(document.activeElement).toBe(r.b["checkpoints"]);
    key(r.b["checkpoints"] as HTMLButtonElement, "End");
    expect(document.activeElement).toBe(r.b["theme"]);
    key(r.b["theme"] as HTMLButtonElement, "ArrowDown");
    expect(document.activeElement).toBe(skills);
    key(skills, "ArrowUp");
    expect(document.activeElement).toBe(r.b["theme"]);
    key(r.b["theme"] as HTMLButtonElement, "Home");
    expect(document.activeElement).toBe(skills);
    expect(key(skills, "a").defaultPrevented).toBe(false);
  });

  it("closes on Escape, handing focus back to More and keeping the key from the panel", () => {
    const r = rig(FULL, MOVABLE);
    r.overflow.show(true);
    let heard = false;
    document.body.addEventListener("keydown", () => {
      heard = true;
    });

    key(r.b["skills"] as HTMLButtonElement, "Escape");
    expect(r.overflow.open).toBe(false);
    expect(document.activeElement).toBe(r.overflow.trigger);
    expect(heard).toBe(false);
  });

  it("runs the control's own listener and closes when a row is chosen", () => {
    const r = rig(FULL, MOVABLE);
    let ran = false;
    r.b["skills"]?.addEventListener("click", () => {
      ran = true;
    });
    r.overflow.show(false);
    r.b["skills"]?.click();

    expect(ran).toBe(true);
    expect(r.overflow.open).toBe(false);
  });

  it("closes on a press elsewhere, not on one inside it or on More", () => {
    const r = rig(FULL, MOVABLE);
    r.overflow.show(false);
    r.b["skills"]?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    r.overflow.trigger.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, composed: true }),
    );
    expect(r.overflow.open).toBe(true);

    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(r.overflow.open).toBe(false);
    // A press elsewhere with it closed changes nothing.
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(r.overflow.open).toBe(false);
  });

  it("closes when focus leaves it, not when it moves inside it or back to More", () => {
    const r = rig(FULL, MOVABLE);
    const outside = document.createElement("button");
    document.body.append(outside);
    r.overflow.show(false);
    const out = (related: EventTarget | null): void => {
      r.b["skills"]?.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: related as Element | null }),
      );
    };

    out(r.b["theme"] as HTMLButtonElement);
    out(r.overflow.trigger);
    out(null);
    expect(r.overflow.open).toBe(true);

    out(outside);
    expect(r.overflow.open).toBe(false);
  });

  it("does not open with nothing in it, and keeps an open menu open across a refit", () => {
    const empty = rig(["history", "new", "collapse"], ["history"]);
    empty.overflow.show(true);
    expect(empty.overflow.open).toBe(false);
    empty.overflow.close(true);
    expect(document.activeElement).not.toBe(empty.overflow.trigger);

    const r = rig(FULL, MOVABLE);
    r.overflow.show(false);
    r.overflow.fit();
    expect(r.overflow.open).toBe(true);
  });

  it("stops observing the header when its connection ends", () => {
    const r = rig(FULL, MOVABLE);
    r.abort.abort();
    r.overflow.trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

    expect(r.overflow.open).toBe(false);
  });

  it("fits when reading the focused node throws, and keeps an open menu open across an unchanged offer", () => {
    const r = rig(FULL, MOVABLE);
    r.controls.getRootNode = () => {
      throw new TypeError("focus is in another tree");
    };
    expect(() => r.overflow.fit()).not.toThrow();

    const make = headerButton("make-routine", "make", "<svg></svg>");
    const offered = rig(FULL, MOVABLE);
    const withMake = new HeaderOverflow({
      header: offered.header,
      title: offered.title,
      controls: offered.controls,
      row: [...offered.controls.children] as HTMLButtonElement[],
      movable: [],
      menuOnly: make,
      label: "More",
      signal: offered.abort.signal,
    });
    withMake.offer(true);
    withMake.show(false);
    withMake.offer(true);
    expect(withMake.open).toBe(true);
    withMake.offer(false);
    expect(withMake.menu.contains(make)).toBe(false);
  });
});
