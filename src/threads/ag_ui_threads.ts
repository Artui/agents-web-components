import {
  AGENT_CHANGE_EVENT,
  AGENTS_TAG,
  RUN_FINISHED_EVENT,
  THREAD_EVENT,
  THREAD_TITLE_EVENT,
  THREADS_CHANGE_EVENT,
  THREADS_SELECT_EVENT,
} from "../constants.js";
import type { ThreadsChangeDetail } from "../core/events/threads_change_detail.js";
import { DEFAULT_THREADS_STRINGS } from "./threads_strings.js";
import { THREADS_STYLES } from "./threads_styles.js";
import type {
  ThreadRow,
  ThreadsChat,
  ThreadsMark,
  ThreadsSelectDetail,
  ThreadsStrings,
  ThreadsStringsInput,
  ThreadsVariant,
} from "./types.js";

/** The part of an `<ag-ui-agents>` provider the list reads, kept structural so this entry never imports it. */
type ThreadsProvider = HTMLElement & { readonly chat: HTMLElement | null };

/** The chat events the list re-lists on: a switch, a new title, a run that moved a thread up. */
const LISTEN_TO = [THREAD_EVENT, THREAD_TITLE_EVENT, RUN_FINISHED_EVENT] as const;

/**
 * `<ag-ui-threads>`: the conversations of one `<ag-ui-chat>`, as a list or as
 * a strip of pills, for a host that draws its own bar or rail.
 *
 * It holds no conversations of its own. It lists the chat's
 * `conversationStore`, marks the thread on screen, and drives the chat's public
 * thread API: a row picked calls `switchThread` (which cancels a run in flight,
 * as the chat's own list does), a delete (behind an inline confirm, in both
 * variants) calls `deleteThread`.
 *
 * Bound by `for="<chat id>"`, looked up in the list's own root (the document,
 * or the shadow root it sits in), or by setting {@link chat}. Without either,
 * it binds to the chat of an `<ag-ui-agents>` provider: the one named by
 * `agents="<provider id>"`, else the nearest one around it, following the
 * provider as it moves its chat between agents. `for` wins over a provider.
 * A chat that is not there yet is picked up when it first reports its thread.
 */
export class AgUiThreads extends HTMLElement {
  static readonly observedAttributes = ["for", "agents", "variant"];

  readonly #list: HTMLUListElement;
  readonly #empty: HTMLParagraphElement;
  #chat: ThreadsChat | null = null;
  /** The chat set by property, which wins over `for`. */
  #explicit: ThreadsChat | null = null;
  #rows: readonly ThreadRow[] = [];
  #strings: ThreadsStrings = DEFAULT_THREADS_STRINGS;
  #confirming: string | null = null;
  /** Bumped per listing, so a slow response that lands after a newer one is dropped. */
  #listing = 0;
  #pending: Promise<void> | null = null;
  #root: Node | null = null;
  /** The provider whose chat this list follows, while it binds through one. */
  #provider: ThreadsProvider | null = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(THREADS_STYLES);
    root.adoptedStyleSheets = [sheet];
    this.#list = document.createElement("ul");
    this.#list.className = "list";
    this.#list.setAttribute("part", "list");
    this.#empty = document.createElement("p");
    this.#empty.className = "empty";
    this.#empty.setAttribute("part", "empty");
    this.#empty.hidden = true;
    root.append(this.#list, this.#empty);
    this.#label();
  }

  /**
   * The chat this list drives. Setting it binds to that element and ignores
   * `for` until it is set back to `null`.
   */
  get chat(): ThreadsChat | null {
    return this.#chat;
  }

  set chat(chat: ThreadsChat | null) {
    this.#explicit = chat;
    this.#bind();
  }

  /** `list` (the default: rows down a rail) or `pills` (a strip that scrolls sideways, for a bar). */
  get variant(): ThreadsVariant {
    return this.getAttribute("variant") === "pills" ? "pills" : "list";
  }

  set variant(variant: ThreadsVariant) {
    this.setAttribute("variant", variant);
  }

  /** The text the list draws, merged over the English defaults. */
  get strings(): ThreadsStrings {
    return this.#strings;
  }

  set strings(strings: ThreadsStringsInput) {
    this.#strings = { ...DEFAULT_THREADS_STRINGS, ...strings };
    this.#label();
    this.#render();
  }

  /** The rows on screen, as the store last listed them. */
  get threads(): readonly ThreadRow[] {
    return this.#rows;
  }

  connectedCallback(): void {
    this.#root = this.getRootNode();
    this.#root.addEventListener(THREAD_EVENT, this.#onRootThread);
    this.#bind();
  }

  disconnectedCallback(): void {
    this.#root?.removeEventListener(THREAD_EVENT, this.#onRootThread);
    this.#root = null;
    this.#follow(null);
    this.#unbind();
  }

  attributeChangedCallback(name: string): void {
    if (name === "for" || name === "agents") {
      this.#bind();
    } else {
      this.#render();
    }
  }

  /**
   * Read the store again and redraw. The list does this itself after every
   * change the chat reports; call it when something else changed the store,
   * such as another tab. Calls made while one is in flight share the next.
   */
  refresh(): Promise<void> {
    if (this.#pending === null) {
      this.#pending = Promise.resolve().then(() => {
        this.#pending = null;
        return this.#relist();
      });
    }
    return this.#pending;
  }

  async #relist(): Promise<void> {
    const chat = this.#chat;
    // Before the chat's first thread its store is the unscoped default.
    if (chat === null || chat.threadId === null) {
      return;
    }
    this.#listing += 1;
    const listing = this.#listing;
    let rows: readonly ThreadRow[];
    try {
      rows = await chat.conversationStore.listThreads();
    } catch {
      return;
    }
    if (listing !== this.#listing || chat !== this.#chat) {
      return;
    }
    this.#rows = rows;
    this.#render();
  }

  #bind(): void {
    const viaProvider = this.#explicit === null && !this.hasAttribute("for");
    this.#follow(viaProvider && this.#root !== null ? this.#findProvider() : null);
    const chat = this.#explicit ?? this.#lookup();
    if (chat === this.#chat) {
      return;
    }
    this.#unbind();
    if (chat === null) {
      return;
    }
    this.#chat = chat;
    for (const type of LISTEN_TO) {
      chat.addEventListener(type, this.#onChatEvent);
    }
    chat.addEventListener(THREADS_CHANGE_EVENT, this.#onThreadsChange);
    void this.refresh();
  }

  #unbind(): void {
    const chat = this.#chat;
    if (chat === null) {
      return;
    }
    for (const type of LISTEN_TO) {
      chat.removeEventListener(type, this.#onChatEvent);
    }
    chat.removeEventListener(THREADS_CHANGE_EVENT, this.#onThreadsChange);
    this.#chat = null;
    this.#listing += 1;
    this.#rows = [];
    this.#render();
  }

  #lookup(): ThreadsChat | null {
    const id = this.getAttribute("for");
    if (id === null || this.#root === null) {
      return (this.#provider?.chat ?? null) as ThreadsChat | null;
    }
    const root = this.#root as Document | ShadowRoot;
    return root.getElementById(id) as ThreadsChat | null;
  }

  /** The provider named by `agents`, else the nearest `<ag-ui-agents>` around the list. */
  #findProvider(): ThreadsProvider | null {
    const id = this.getAttribute("agents");
    if (id === null) {
      return this.closest<ThreadsProvider>(AGENTS_TAG);
    }
    const root = this.#root as Document | ShadowRoot;
    return root.getElementById(id) as ThreadsProvider | null;
  }

  #follow(provider: ThreadsProvider | null): void {
    if (provider === this.#provider) {
      return;
    }
    this.#provider?.removeEventListener(AGENT_CHANGE_EVENT, this.#onAgentChange);
    this.#provider = provider;
    provider?.addEventListener(AGENT_CHANGE_EVENT, this.#onAgentChange);
  }

  /** The provider moved its chat to another agent: the same element, now another agent's store. */
  readonly #onAgentChange = (): void => {
    this.#bind();
    void this.refresh();
  };

  /** A chat reporting in while the list has none, or holds one that left the page. */
  readonly #onRootThread = (): void => {
    if (this.#chat === null || !this.#chat.isConnected) {
      this.#bind();
    }
  };

  readonly #onChatEvent = (): void => {
    void this.refresh();
  };

  /** A list the chat's watch received: drawn as it is, and newer than any listing in flight. */
  readonly #onThreadsChange = (event: Event): void => {
    this.#listing += 1;
    this.#rows = (event as CustomEvent<ThreadsChangeDetail>).detail.threads;
    this.#render();
  };

  #label(): void {
    this.#list.setAttribute("aria-label", this.#strings.label);
  }

  #render(): void {
    const pills = this.variant === "pills";
    const activeId = this.#chat?.threadId ?? null;
    const items = this.#rows.map((row) => this.#row(row, row.threadId === activeId));
    const focused = this.#focused();
    this.#list.replaceChildren(...items);
    if (focused !== null) {
      this.#list
        .querySelector<HTMLElement>(
          `.row[data-thread-id="${CSS.escape(focused.threadId)}"] .${focused.control}`,
        )
        ?.focus();
    }
    const empty = this.#chat !== null && this.#rows.length === 0;
    this.#list.hidden = empty;
    this.#empty.hidden = !empty || pills;
    this.#empty.textContent = this.#strings.empty;
    this.toggleAttribute("data-empty", empty);
  }

  /** The row and control holding focus, so a redraw can hand it to their replacement. */
  #focused(): { readonly threadId: string; readonly control: string } | null {
    const active = (this.shadowRoot as ShadowRoot).activeElement;
    const threadId = active?.closest<HTMLElement>(".row")?.dataset["threadId"];
    if (active === null || threadId === undefined) {
      return null;
    }
    return { threadId, control: active.className };
  }

  #row(row: ThreadRow, active: boolean): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "row";
    item.setAttribute("part", active ? "row row-active" : "row");
    item.dataset["threadId"] = row.threadId;
    item.toggleAttribute("data-active", active);
    const title = row.title === "" ? this.#strings.untitled : row.title;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    main.setAttribute("part", "row-button");
    if (active) {
      main.setAttribute("aria-current", "true");
    }
    const text = document.createElement("span");
    text.className = "title";
    text.textContent = title;
    main.append(text);
    const mark = markOf(row);
    if (mark !== null) {
      item.dataset["status"] = mark;
      const dot = document.createElement("span");
      dot.className = "mark";
      dot.setAttribute("part", `mark mark-${mark}`);
      dot.textContent = this.#strings[mark];
      main.append(dot);
    }
    main.addEventListener("click", () => this.#select(row.threadId));
    item.append(main);
    this.#addDelete(item, main, row.threadId, title);
    return item;
  }

  #addDelete(item: HTMLLIElement, main: HTMLButtonElement, threadId: string, title: string): void {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.setAttribute("part", "delete");
    remove.setAttribute("aria-label", this.#strings.delete.replace("{title}", title));
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      this.#confirming = threadId;
      this.#render();
      this.#list
        .querySelector<HTMLButtonElement>(`.row[data-thread-id="${CSS.escape(threadId)}"] .no`)
        ?.focus();
    });
    item.append(remove);
    if (this.#confirming !== threadId) {
      return;
    }
    item.toggleAttribute("data-confirming", true);
    main.hidden = true;
    remove.hidden = true;
    const confirm = document.createElement("div");
    confirm.className = "confirm";
    confirm.setAttribute("part", "confirm");
    const question = document.createElement("span");
    question.textContent = this.#strings.deleteConfirm;
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "yes";
    yes.textContent = this.#strings.deleteYes;
    yes.addEventListener("click", () => this.#delete(threadId));
    const no = document.createElement("button");
    no.type = "button";
    no.className = "no";
    no.textContent = this.#strings.deleteNo;
    no.addEventListener("click", () => {
      this.#confirming = null;
      this.#render();
    });
    confirm.append(question, yes, no);
    item.append(confirm);
  }

  #select(threadId: string): void {
    const proceed = this.dispatchEvent(
      new CustomEvent<ThreadsSelectDetail>(THREADS_SELECT_EVENT, {
        detail: { threadId },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    if (proceed) {
      // A rejected load leaves the chat where it was, which the list already shows.
      this.#chat?.switchThread(threadId).catch(() => undefined);
    }
  }

  #delete(threadId: string): void {
    this.#confirming = null;
    // Deleting a thread that is not on screen fires nothing on the chat.
    this.#rows = this.#rows.filter((row) => row.threadId !== threadId);
    this.#chat?.deleteThread(threadId);
    this.#render();
    void this.refresh();
  }
}

/** The one mark a row carries, or `null` for an idle, read row. */
function markOf(row: ThreadRow): ThreadsMark | null {
  if (row.status === "waiting" || row.status === "failed" || row.status === "running") {
    return row.status;
  }
  return row.unread === true ? "unread" : null;
}
