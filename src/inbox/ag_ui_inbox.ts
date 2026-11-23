import type { Interrupt } from "@ag-ui/core";
import type { InboxRow } from "../agents/types.js";
import {
  AGENTS_CHANGE_EVENT,
  AGENTS_TAG,
  INBOX_CHANGE_EVENT,
  INBOX_SELECT_EVENT,
} from "../constants.js";
import { DEFAULT_INBOX_STRINGS } from "./inbox_strings.js";
import { INBOX_STYLES } from "./inbox_styles.js";
import type {
  InboxItem,
  InboxKind,
  InboxProvider,
  InboxSelectDetail,
  InboxStrings,
  InboxStringsInput,
  InboxVariant,
} from "./types.js";

/** The provider events the inbox redraws on: new rows, and new agent names for them. */
const LISTEN_TO = [INBOX_CHANGE_EVENT, AGENTS_CHANGE_EVENT] as const;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * `<ag-ui-inbox>`: the conversations that wait on the user, across every agent
 * of an `<ag-ui-agents>` provider -- an approval, a question, a client tool a
 * detached run parked on.
 *
 * It holds no rows of its own. It reads the provider's `inbox`, which the
 * provider keeps fresh by ETag polling or SSE as the host chose
 * (`data-inbox-transport`), and redraws on each change. A row picked fires the
 * cancelable {@link INBOX_SELECT_EVENT}, then has the provider open it in its
 * chat (`openThread`).
 *
 * `variant="badge"` (the default) is a button counting the waiting
 * conversations that opens the list in a popover, for a host's navbar;
 * `variant="list"` is the list alone, for a home page's "needs you" section.
 * Bound to the provider named by `agents="<provider id>"`, else the nearest one
 * around it, or to the one set as {@link provider}.
 */
export class AgUiInbox extends HTMLElement {
  static readonly observedAttributes = ["agents", "variant"];

  readonly #badge: HTMLButtonElement;
  readonly #count: HTMLSpanElement;
  readonly #panel: HTMLDivElement;
  readonly #heading: HTMLParagraphElement;
  readonly #list: HTMLUListElement;
  readonly #empty: HTMLParagraphElement;
  #provider: InboxProvider | null = null;
  /** The provider set by property, which wins over `agents` and the nearest one. */
  #explicit: InboxProvider | null = null;
  #items: readonly InboxItem[] = [];
  #strings: InboxStrings = DEFAULT_INBOX_STRINGS;
  #open = false;
  #root: Node | null = null;
  /** Set on first connect: a constructor may not write its host's attributes. */
  #upgraded = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(INBOX_STYLES);
    root.adoptedStyleSheets = [sheet];
    this.#badge = document.createElement("button");
    this.#badge.type = "button";
    this.#badge.className = "badge";
    this.#badge.setAttribute("part", "badge");
    this.#badge.setAttribute("aria-haspopup", "true");
    this.#badge.setAttribute("aria-expanded", "false");
    this.#badge.append(inboxIcon());
    this.#count = document.createElement("span");
    this.#count.className = "count";
    this.#count.setAttribute("part", "count");
    this.#count.setAttribute("aria-hidden", "true");
    this.#badge.append(this.#count);
    this.#badge.addEventListener("click", () => this.#toggle(!this.#open));
    this.#panel = document.createElement("div");
    this.#panel.className = "panel";
    this.#panel.setAttribute("part", "panel");
    this.#panel.id = "panel";
    this.#badge.setAttribute("aria-controls", "panel");
    this.#heading = document.createElement("p");
    this.#heading.className = "heading";
    this.#heading.setAttribute("part", "heading");
    this.#list = document.createElement("ul");
    this.#list.className = "list";
    this.#list.setAttribute("part", "list");
    this.#empty = document.createElement("p");
    this.#empty.className = "empty";
    this.#empty.setAttribute("part", "empty");
    this.#panel.append(this.#heading, this.#list, this.#empty);
    this.#panel.addEventListener("keydown", this.#onPanelKey);
    root.append(this.#badge, this.#panel);
    this.#render();
  }

  /**
   * The provider this inbox reads. Setting it binds to that element and
   * ignores `agents` until it is set back to `null`.
   */
  get provider(): InboxProvider | null {
    return this.#provider;
  }

  set provider(provider: InboxProvider | null) {
    this.#explicit = provider;
    this.#bind();
  }

  /** `badge` (the default: a count that opens the list) or `list` (the list alone). */
  get variant(): InboxVariant {
    return this.getAttribute("variant") === "list" ? "list" : "badge";
  }

  set variant(variant: InboxVariant) {
    this.setAttribute("variant", variant);
  }

  /** The text the inbox draws, merged over the English defaults. */
  get strings(): InboxStrings {
    return this.#strings;
  }

  set strings(strings: InboxStringsInput) {
    this.#strings = { ...DEFAULT_INBOX_STRINGS, ...strings };
    this.#render();
  }

  /** The conversations that wait on the user, newest first, as the provider last listed them. */
  get items(): readonly InboxItem[] {
    return this.#items;
  }

  /** Whether the badge's list is open. Always `false` for `variant="list"`. */
  get open(): boolean {
    return this.#open;
  }

  set open(open: boolean) {
    this.#toggle(open);
  }

  connectedCallback(): void {
    this.#upgraded = true;
    this.#root = this.getRootNode();
    for (const type of LISTEN_TO) {
      this.#root.addEventListener(type, this.#onRootEvent);
    }
    this.#bind();
    this.#render();
  }

  disconnectedCallback(): void {
    for (const type of LISTEN_TO) {
      this.#root?.removeEventListener(type, this.#onRootEvent);
    }
    this.#root = null;
    this.#toggle(false);
    this.#unbind();
  }

  attributeChangedCallback(name: string): void {
    if (name === "agents") {
      this.#bind();
    } else {
      this.#toggle(false);
      this.#render();
    }
  }

  #bind(): void {
    const provider = this.#explicit ?? (this.#root === null ? null : this.#find());
    if (provider === this.#provider) {
      return;
    }
    this.#unbind();
    if (provider === null) {
      return;
    }
    this.#provider = provider;
    for (const type of LISTEN_TO) {
      provider.addEventListener(type, this.#onProviderEvent);
    }
    this.#read();
  }

  #unbind(): void {
    const provider = this.#provider;
    if (provider === null) {
      return;
    }
    for (const type of LISTEN_TO) {
      provider.removeEventListener(type, this.#onProviderEvent);
    }
    this.#provider = null;
    this.#read();
  }

  /** The provider named by `agents`, else the nearest `<ag-ui-agents>` around the inbox. */
  #find(): InboxProvider | null {
    const id = this.getAttribute("agents");
    if (id === null) {
      return this.closest<InboxProvider>(AGENTS_TAG);
    }
    const root = this.#root as Document | ShadowRoot;
    return root.getElementById(id) as InboxProvider | null;
  }

  /** A provider that was not there when the inbox connected, reporting in. */
  readonly #onRootEvent = (): void => {
    if (this.#provider === null) {
      this.#bind();
    }
  };

  readonly #onProviderEvent = (): void => {
    this.#read();
  };

  #read(): void {
    this.#items = (this.#provider?.inbox ?? []).filter(needsYou);
    this.#render();
  }

  #toggle(open: boolean): void {
    const next = open && this.variant === "badge";
    if (next === this.#open) {
      return;
    }
    this.#open = next;
    if (next) {
      document.addEventListener("pointerdown", this.#onOutside, true);
    } else {
      document.removeEventListener("pointerdown", this.#onOutside, true);
    }
    this.#render();
    if (next) {
      this.#list.querySelector<HTMLButtonElement>(".row-main")?.focus();
    }
  }

  readonly #onOutside = (event: Event): void => {
    if (!event.composedPath().includes(this)) {
      this.#toggle(false);
    }
  };

  readonly #onPanelKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.#open) {
      event.stopPropagation();
      this.#toggle(false);
      this.#badge.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    const buttons = [...this.#list.querySelectorAll<HTMLButtonElement>(".row-main")];
    const at = buttons.indexOf((this.shadowRoot as ShadowRoot).activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = buttons[(at + step + buttons.length) % buttons.length];
    if (next !== undefined) {
      event.preventDefault();
      next.focus();
    }
  };

  #render(): void {
    const strings = this.#strings;
    const badge = this.variant === "badge";
    const count = this.#items.length;
    if (this.#upgraded) {
      this.toggleAttribute("data-empty", count === 0);
      this.setAttribute("data-count", String(count));
    }
    this.#badge.hidden = !badge;
    this.#badge.setAttribute("aria-label", strings.badge.replace("{count}", String(count)));
    this.#badge.setAttribute("aria-expanded", String(this.#open));
    this.#count.hidden = count === 0;
    this.#count.textContent = count > 99 ? "99+" : String(count);
    this.#panel.hidden = badge && !this.#open;
    this.#heading.hidden = !badge;
    this.#heading.textContent = strings.label;
    this.#list.setAttribute("aria-label", strings.label);
    this.#list.replaceChildren(...this.#items.map((item) => this.#row(item)));
    this.#list.hidden = count === 0;
    this.#empty.hidden = count !== 0;
    this.#empty.textContent = strings.empty;
  }

  #row(item: InboxItem): HTMLLIElement {
    const strings = this.#strings;
    const row = document.createElement("li");
    row.className = "row";
    row.setAttribute("part", "row");
    row.dataset["threadId"] = item.threadId;
    row.dataset["agentId"] = item.agentId;
    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    main.setAttribute("part", "row-button");
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.setAttribute("part", "mark");
    mark.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = item.title === "" ? strings.untitled : item.title;
    const agent = this.#provider?.agents.find((entry) => entry.id === item.agentId);
    if (agent !== undefined && agent.name !== "") {
      const name = document.createElement("span");
      name.className = "agent";
      name.setAttribute("part", "agent");
      name.textContent = ` · ${agent.name}`;
      title.append(name);
    }
    main.append(mark, title, this.#summary(item.interrupts));
    main.addEventListener("click", () => this.#select(item));
    row.append(main);
    return row;
  }

  /** What the row waits on: its first interrupt's kind and message, and how many more. */
  #summary(interrupts: readonly Interrupt[]): HTMLSpanElement {
    const strings = this.#strings;
    const first = interrupts[0] as Interrupt;
    const kind = kindOf(first);
    const summary = document.createElement("span");
    summary.className = "summary";
    summary.setAttribute("part", "summary");
    const label = document.createElement("span");
    label.className = "kind";
    label.dataset["kind"] = kind;
    label.textContent = strings[kind];
    summary.append(label);
    if (kind === "approval" && isDestructive(first)) {
      const destructive = document.createElement("span");
      destructive.className = "destructive";
      destructive.setAttribute("part", "destructive");
      destructive.textContent = ` · ${strings.destructive}`;
      summary.append(destructive);
    }
    if (typeof first.message === "string" && first.message !== "") {
      summary.append(`: ${first.message}`);
    }
    if (interrupts.length > 1) {
      summary.append(` ${strings.more.replace("{count}", String(interrupts.length - 1))}`);
    }
    return summary;
  }

  #select(item: InboxItem): void {
    const proceed = this.dispatchEvent(
      new CustomEvent<InboxSelectDetail>(INBOX_SELECT_EVENT, {
        detail: { agentId: item.agentId, threadId: item.threadId },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    this.#toggle(false);
    if (proceed) {
      // A rejected load leaves the chat where it was; the row stays until the inbox says otherwise.
      this.#provider?.openThread(item.agentId, item.threadId).catch(() => undefined);
    }
  }
}

/** Whether a row waits on the user: a parked run with at least one interrupt. */
function needsYou(row: InboxRow): row is InboxItem {
  return row.status === "waiting" && row.interrupts !== undefined && row.interrupts.length > 0;
}

function metadataOf(interrupt: Interrupt): Record<string, unknown> {
  const metadata = (interrupt as { metadata?: unknown }).metadata;
  return typeof metadata === "object" && metadata !== null
    ? (metadata as Record<string, unknown>)
    : {};
}

/** The interrupt's `metadata.kind`; one this element does not know waits on an action. */
function kindOf(interrupt: Interrupt): InboxKind {
  const kind = metadataOf(interrupt)["kind"];
  return kind === "approval" || kind === "question" ? kind : "external";
}

/** Destructive unless the server says otherwise: a missing flag is not a safe one. */
function isDestructive(interrupt: Interrupt): boolean {
  return metadataOf(interrupt)["destructive"] !== false;
}

/** An inbox tray, drawn rather than a glyph so it follows `currentColor` and the font size. */
function inboxIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("part", "icon");
  const tray = document.createElementNS(SVG_NS, "path");
  tray.setAttribute("d", "M3 13h5l1.5 3h5L16 13h5");
  const box = document.createElementNS(SVG_NS, "path");
  box.setAttribute("d", "M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z");
  svg.append(tray, box);
  return svg;
}
