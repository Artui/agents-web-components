import { ICON_MORE } from "../../constants.js";
import { headerButton } from "./header_button.js";

/** The most controls the row shows beside the More button once any have moved into it. */
const INLINE_CAP = 4;

/** Narrower than this and the title has lost the row to the controls. */
const TITLE_MIN_PX = 64;

/** What {@link HeaderOverflow} arranges: the row, and the controls it may move. */
export interface HeaderOverflowOptions {
  readonly header: HTMLElement;
  readonly title: HTMLElement;
  readonly controls: HTMLElement;
  /** Every control the row can hold, in row order; the ones not in `movable` never move. */
  readonly row: readonly HTMLButtonElement[];
  /** The controls that may move into More, the first to go first. */
  readonly movable: readonly HTMLButtonElement[];
  readonly label: string;
  readonly signal: AbortSignal;
}

/**
 * The header's More button and its menu: the movable controls the row has no
 * room for (or that would take it past {@link INLINE_CAP}) move into
 * the menu as the same nodes, so their classes, parts, slots and listeners,
 * and a host clicking one by its class, are unchanged by where they sit.
 */
export class HeaderOverflow {
  /** The More trigger, in the row only while the menu holds something. */
  readonly trigger: HTMLButtonElement;
  /** The menu, a sibling of the header so a press on it never drags the panel. */
  readonly menu: HTMLElement;
  readonly #options: HeaderOverflowOptions;

  constructor(options: HeaderOverflowOptions) {
    this.#options = options;
    this.trigger = headerButton("more", options.label, ICON_MORE);
    this.trigger.setAttribute("aria-haspopup", "menu");
    this.trigger.setAttribute("aria-expanded", "false");
    this.trigger.setAttribute("aria-controls", "ag-ui-header-menu");
    this.menu = document.createElement("div");
    this.menu.className = "header-menu";
    this.menu.id = "ag-ui-header-menu";
    this.menu.setAttribute("part", "header-menu");
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", options.label);
    this.menu.hidden = true;

    const { signal } = options;
    // A click with no pointer behind it is Enter or Space, which lands on the first item.
    this.trigger.addEventListener("click", (event) => this.toggle(event.detail === 0), { signal });
    this.trigger.addEventListener("keydown", (event) => this.#onTriggerKey(event), { signal });
    this.menu.addEventListener("keydown", (event) => this.#onMenuKey(event), { signal });
    // An item's own listener has run by now; the menu has done its job.
    this.menu.addEventListener("click", () => this.close(), { signal });
    this.menu.addEventListener("focusout", (event) => this.#onFocusOut(event), { signal });
    document.addEventListener("pointerdown", (event) => this.#onOutside(event), { signal });
    const observer = new ResizeObserver(() => this.fit());
    observer.observe(options.header);
    signal.addEventListener("abort", () => observer.disconnect());
  }

  /** Whether the menu is showing. */
  get open(): boolean {
    return !this.menu.hidden;
  }

  /** Put every control back in the row, then move them out until the row fits. */
  fit(): void {
    const { controls, row, movable, header, title } = this.#options;
    const was = this.open;
    // Before the header is attached its root is a plain element, which holds no focus.
    const held = (controls.getRootNode() as ShadowRoot).activeElement ?? null;
    this.close();
    const present = row.filter((b) => movable.includes(b) || b.parentElement === controls);
    controls.replaceChildren(...present);
    for (const b of movable) {
      b.removeAttribute("role");
      b.removeAttribute("tabindex");
    }
    this.menu.replaceChildren();
    const laidOut = header.clientWidth > 0;
    const crowded = (): boolean =>
      laidOut && (header.scrollWidth > header.clientWidth + 1 || title.clientWidth < TITLE_MIN_PX);
    // A menu of one is a button behind a click, so one control over the cap stays.
    let inline = present.length;
    const overCap = (): boolean =>
      inline > INLINE_CAP + 1 || (this.#moved() && inline > INLINE_CAP);
    for (const b of movable) {
      if (!overCap() && !crowded()) {
        break;
      }
      this.#move(b);
      inline -= 1;
    }
    if (was && this.#moved()) {
      this.show(false);
    }
    this.#restore(held);
  }

  /** The reshuffle blurs what had focus: give it back, or More when it now sits in the closed menu. */
  #restore(held: Element | null): void {
    if (held === null || !held.isConnected) {
      return;
    }
    const hidden = this.menu.contains(held) && !this.open;
    (hidden ? this.trigger : (held as HTMLElement)).focus();
  }

  /** Open the menu, or close it if it is open; `focus` moves focus to its first item. */
  toggle(focus = false): void {
    if (this.open) {
      this.close();
    } else {
      this.show(focus);
    }
  }

  /** Open the menu; `focus` moves focus to its first item, or its last when `"last"`. */
  show(focus: boolean | "last"): void {
    const items = this.#items();
    if (items.length === 0) {
      return;
    }
    const { header } = this.#options;
    this.menu.style.insetBlockStart = `${header.offsetTop + header.offsetHeight + 4}px`;
    this.menu.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    if (focus !== false) {
      (focus === "last" ? items[items.length - 1] : items[0])?.focus();
    }
  }

  /** Close the menu; `refocus` hands focus back to the More button. */
  close(refocus = false): void {
    if (!this.open) {
      return;
    }
    this.menu.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    if (refocus) {
      this.trigger.focus();
    }
  }

  #moved(): boolean {
    return this.menu.childElementCount > 0;
  }

  #move(button: HTMLButtonElement): void {
    const { row, controls } = this.#options;
    if (!this.#moved()) {
      // Ahead of the window controls, which close the row.
      const tail = controls.querySelector(".header-btn--maximize") ?? controls.lastElementChild;
      controls.insertBefore(this.trigger, tail);
    }
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    // The menu keeps the row's order, whichever went first.
    const after = this.#items().find((item) => row.indexOf(item) > row.indexOf(button));
    this.menu.insertBefore(button, after ?? null);
  }

  #items(): HTMLButtonElement[] {
    return [...this.menu.children] as HTMLButtonElement[];
  }

  #onTriggerKey(event: KeyboardEvent): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.show(event.key === "ArrowUp" ? "last" : true);
    }
  }

  #onMenuKey(event: KeyboardEvent): void {
    const items = this.#items();
    const at = items.indexOf(event.target as HTMLButtonElement);
    const to: Record<string, number> = {
      ArrowDown: (at + 1) % items.length,
      ArrowUp: (at - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    };
    const index = to[event.key];
    if (index !== undefined) {
      event.preventDefault();
      items[index]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
    }
  }

  #onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next !== null && !this.menu.contains(next) && next !== this.trigger) {
      this.close();
    }
  }

  #onOutside(event: PointerEvent): void {
    const path = event.composedPath();
    if (this.open && !path.includes(this.menu) && !path.includes(this.trigger)) {
      this.close();
    }
  }
}
