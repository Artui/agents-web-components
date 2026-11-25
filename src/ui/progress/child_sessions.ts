import { OPEN_THREAD_EVENT } from "../../constants.js";
import type { ThreadMeta, ThreadStatus } from "../../core/conversation_store.js";
import type { OpenThreadDetail } from "../../core/events/open_thread_detail.js";
import { ParentBreadcrumb } from "../history/parent_breadcrumb.js";
import type { UiStrings } from "../ui_strings.js";
import { ChildSessionLink } from "./child_session_link.js";
import { childSessionReceipt } from "./child_session_receipt.js";
import type { ToolCallCard } from "./tool_call_card.js";

/** What {@link ChildSessions} needs from the chat it serves. */
export interface ChildSessionsHost {
  /** The chat element: {@link OPEN_THREAD_EVENT} is dispatched on it. */
  readonly element: HTMLElement;
  /** The transcript's container: a link no longer inside it was drawn over. */
  readonly transcript: () => Node;
  readonly strings: () => UiStrings;
  /** The thread on screen. */
  readonly activeThread: () => string;
  /** Open `threadId` in this chat, the way a row picked in the drawer does. */
  readonly open: (threadId: string) => void;
}

/**
 * The chat's side of child sessions: the link in each card that started one,
 * and the breadcrumb back from a child to its parent.
 *
 * Both read the thread list the chat already holds, from whichever of its two
 * sources last delivered one (the drawer's listing or the status watch), and
 * nothing here asks for a list of its own. A link drawn before any list
 * arrives reads as plain, and is reworded when one does.
 *
 * Opening a thread asks first: {@link OPEN_THREAD_EVENT} goes out cancelable,
 * since the chat cannot tell which agent it serves and a child usually runs on
 * another. A host that routes threads across agents takes it and calls
 * `preventDefault()`; otherwise the thread opens in place.
 */
export class ChildSessions {
  readonly #host: ChildSessionsHost;
  readonly #breadcrumb: ParentBreadcrumb;
  readonly #links = new Set<ChildSessionLink>();
  #threads: readonly ThreadMeta[] = [];
  readonly #gone = new Set<string>();

  constructor(host: ChildSessionsHost) {
    this.#host = host;
    this.#breadcrumb = new ParentBreadcrumb((parent) => this.#open(parent.scope, parent.threadId));
    host.element.addEventListener("click", (event) => this.#openReported(event));
  }

  /** The breadcrumb's root, for the chat to place in its column. */
  get breadcrumb(): HTMLElement {
    return this.#breadcrumb.element;
  }

  /**
   * Link `card` to the child its result names, when it is a `start_session`
   * receipt. Anything else, a refusal included, leaves the card alone.
   */
  attach(card: ToolCallCard, content: string): void {
    const receipt = childSessionReceipt(card.element.getAttribute("data-tool-name"), content);
    if (receipt === null) {
      return;
    }
    const link = new ChildSessionLink(receipt, (target) =>
      this.#open(target.agentId, target.threadId),
    );
    this.#word(link);
    card.subagentSlot.appendChild(link.element);
    this.#links.add(link);
  }

  /** Take a thread list the chat received, rewording every link and the breadcrumb. */
  listed(threads: readonly ThreadMeta[]): void {
    this.#threads = threads.map((meta) =>
      meta.parent !== undefined && this.#gone.has(meta.parent.threadId)
        ? withoutParent(meta)
        : meta,
    );
    this.relocalize();
  }

  /** The status the held list gives `threadId`, or `null` when it lists none. */
  status(threadId: string): ThreadStatus | null {
    return this.#threads.find((meta) => meta.threadId === threadId)?.status ?? null;
  }

  /** A thread was deleted: no list, now or later, names it as a parent. */
  deleted(threadId: string): void {
    this.#gone.add(threadId);
    this.listed(this.#threads);
  }

  /** The thread on screen changed: the breadcrumb follows it. */
  shown(): void {
    this.#breadcrumb.show(this.#threads, this.#host.activeThread(), this.#host.strings());
  }

  /** Word everything again, after the strings or the list changed. */
  relocalize(): void {
    const transcript = this.#host.transcript();
    for (const link of this.#links) {
      if (transcript.contains(link.element)) {
        this.#word(link);
      } else {
        this.#links.delete(link);
      }
    }
    this.shown();
  }

  #word(link: ChildSessionLink): void {
    const row = this.#threads.find((meta) => meta.threadId === link.receipt.threadId);
    link.update(this.#host.strings(), row?.status ?? null);
  }

  /** A click on a child's report card's link, delegated: the card is drawn by a renderer. */
  #openReported(event: Event): void {
    const target = event.composedPath()[0];
    const link = target instanceof Element ? target.closest(".child-report-link") : null;
    if (link !== null) {
      this.#open(
        link.getAttribute("data-agent-id") || null,
        String(link.getAttribute("data-thread-id")),
      );
    }
  }

  #open(agentId: string | null, threadId: string): void {
    const event = new CustomEvent<OpenThreadDetail>(OPEN_THREAD_EVENT, {
      detail: { agentId, threadId },
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    if (this.#host.element.dispatchEvent(event)) {
      this.#host.open(threadId);
    }
  }
}

function withoutParent(meta: ThreadMeta): ThreadMeta {
  const { parent: _parent, ...rest } = meta;
  return rest;
}
