import {
  RUN_FINISHED_EVENT,
  THREAD_EVENT,
  THREAD_STATUS,
  THREAD_TITLE_EVENT,
  THREADS_SELECT_EVENT,
  UNREAD_EVENT,
} from "../constants.js";
import type { RunFinishedDetail } from "../core/events/run_finished_detail.js";
import type { UnreadDetail } from "../core/events/unread_detail.js";
import { LiveMarks } from "./live_marks.js";
import { rowStatus } from "./row_status.js";
import { DEFAULT_THREADS_STRINGS } from "./threads_strings.js";
import { THREADS_STYLES } from "./threads_styles.js";
import type {
  ThreadRow,
  ThreadsChat,
  ThreadsSelectDetail,
  ThreadsStrings,
  ThreadsStringsInput,
  ThreadsVariant,
} from "./types.js";

/** The chat events the list redraws on; all but the unread one also re-list. */
const LISTEN_TO = [THREAD_EVENT, THREAD_TITLE_EVENT, RUN_FINISHED_EVENT, UNREAD_EVENT] as const;

/**
 * `<ag-ui-threads>`: the conversations of one `<ag-ui-chat>`, as a list or as
 * a strip of pills, for a host that draws its own bar or rail.
 *
 * It holds no conversations of its own. It lists the chat's
 * `conversationStore`, marks the thread on screen, and drives the chat's public
 * thread API: a row picked calls `switchThread` (which cancels a run in flight,
 * as the chat's own list does), a delete calls `deleteThread`. Each row is
 * marked running, waiting, failed or unread, from the live chat and from what
 * the store's rows carry.
 *
 * Bound by `for="<chat id>"`, looked up in the list's own root (the document,
 * or the shadow root it sits in), or by setting {@link chat}. A chat that is
 * not there yet is picked up when it first reports its thread.
 */
export class AgUiThreads extends HTMLElement {
  static readonly observedAttributes = ["for", "variant"];

  readonly #list: HTMLUListElement;
  readonly #empty: HTMLParagraphElement;
  #chat: ThreadsChat | null = null;
  /** The chat set by property, which wins over `for`. */
  #explicit: ThreadsChat | null = null;
  #marks = new LiveMarks(0);
  #rows: readonly ThreadRow[] = [];
  #strings: ThreadsStrings = DEFAULT_THREADS_STRINGS;
  #confirming: string | null = null;
  #runningId: string | null = null;
  /** Bumped per listing, so a slow response that lands after a newer one is dropped. */
  #listing = 0;
  #pending: Promise<void> | null = null;
  #root: Node | null = null;
  readonly #watch = new MutationObserver(() => this.#syncRunning());

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

  /** `list` (the default: rows with a delete) or `pills` (select only, for a bar). */
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
    this.#strings = {
      ...DEFAULT_THREADS_STRINGS,
      ...strings,
      status: { ...DEFAULT_THREADS_STRINGS.status, ...strings.status },
    };
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
    this.#unbind();
  }

  attributeChangedCallback(name: string): void {
    if (name === "for") {
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
    const chat = this.#explicit ?? this.#lookup();
    if (chat === this.#chat) {
      return;
    }
    this.#unbind();
    if (chat === null) {
      return;
    }
    this.#chat = chat;
    this.#marks = new LiveMarks(chat.unread);
    for (const type of LISTEN_TO) {
      chat.addEventListener(type, this.#onChatEvent);
    }
    this.#watch.observe(chat, { attributes: true, attributeFilter: ["data-running"] });
    this.#syncRunning();
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
    this.#watch.disconnect();
    this.#chat = null;
    this.#runningId = null;
    this.#listing += 1;
    this.#rows = [];
    this.#render();
  }

  #lookup(): ThreadsChat | null {
    const id = this.getAttribute("for");
    if (id === null || this.#root === null) {
      return null;
    }
    const root = this.#root as Document | ShadowRoot;
    return root.getElementById(id) as ThreadsChat | null;
  }

  /** A chat named by `for` that was not there when the list connected, reporting in. */
  readonly #onRootThread = (event: Event): void => {
    if (this.#chat === null && event.target instanceof HTMLElement) {
      const id = this.getAttribute("for");
      if (id !== null && event.target.id === id) {
        this.#bind();
      }
    }
  };

  readonly #onChatEvent = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (event.type === RUN_FINISHED_EVENT) {
      this.#marks.runFinished(detail as RunFinishedDetail);
    } else if (event.type === UNREAD_EVENT) {
      // Only this page's marks moved: the chat reports one on every collapse toggle.
      this.#marks.unreadChanged(detail as UnreadDetail);
      this.#render();
      return;
    }
    this.#syncRunning();
    void this.refresh();
  };

  #syncRunning(): void {
    const chat = this.#chat;
    const running = chat?.running ? chat.threadId : null;
    if (running === this.#runningId) {
      return;
    }
    if (running !== null) {
      this.#marks.runStarted(running);
    }
    this.#runningId = running;
    this.#render();
  }

  #label(): void {
    this.#list.setAttribute("aria-label", this.#strings.label);
  }

  #render(): void {
    const pills = this.variant === "pills";
    const activeId = this.#chat?.threadId ?? null;
    const items = this.#rows.map((row) => this.#row(row, row.threadId === activeId, pills));
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

  #row(row: ThreadRow, active: boolean, pills: boolean): HTMLLIElement {
    const item = document.createElement("li");
    item.className = "row";
    item.setAttribute("part", active ? "row row-active" : "row");
    item.dataset["threadId"] = row.threadId;
    const status = rowStatus(row, this.#runningId, this.#marks);
    item.dataset["status"] = status;
    item.toggleAttribute("data-active", active);
    const title = row.title === "" ? this.#strings.untitled : row.title;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "row-main";
    main.setAttribute("part", "row-button");
    if (active) {
      main.setAttribute("aria-current", "true");
    }
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.setAttribute("part", "mark");
    mark.dataset["status"] = status;
    mark.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "title";
    text.textContent = title;
    main.append(mark, text);
    if (status !== THREAD_STATUS.IDLE) {
      const said = document.createElement("span");
      said.className = "sr";
      said.textContent = `, ${this.#strings.status[status]}`;
      main.append(said);
    }
    main.addEventListener("click", () => this.#select(row.threadId));
    item.append(main);

    if (!pills) {
      this.#addDelete(item, main, row.threadId, title);
    }
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
