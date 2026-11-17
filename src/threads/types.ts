import type { ThreadStatus } from "../constants.js";
import type { AgUiChat } from "../core/ag_ui_chat.js";
import type { ThreadMeta } from "../core/conversation_store.js";

/**
 * A row as `<ag-ui-threads>` reads it: the store's {@link ThreadMeta}, plus
 * the run state a store may carry. Every extra key is optional, so a store that
 * knows nothing of runs (the built-in ones today) still renders, marked only
 * from what the chat in this page saw.
 */
export interface ThreadRow extends ThreadMeta {
  /** The thread's run as the store knows it, across tabs and reloads. */
  readonly status?: "idle" | "running" | "waiting" | "failed";
}

/**
 * The part of `<ag-ui-chat>` the list drives: its public thread API and the
 * store it lists from. Typed from the element itself so the two cannot drift.
 */
export type ThreadsChat = HTMLElement &
  Pick<
    AgUiChat,
    "threadId" | "running" | "unread" | "conversationStore" | "switchThread" | "deleteThread"
  >;

/** How the list is drawn: rows with a delete, or a strip of pills for a bar. */
export type ThreadsVariant = "list" | "pills";

/** `detail` shape of the {@link THREADS_SELECT_EVENT} CustomEvent. */
export interface ThreadsSelectDetail {
  /** The conversation picked. */
  readonly threadId: string;
}

/** Every piece of text the list draws; set `strings` to translate it. */
export interface ThreadsStrings {
  /** The list's accessible name. */
  readonly label: string;
  /** A row whose thread has no title yet. */
  readonly untitled: string;
  /** The list mode's text when there is nothing to list. */
  readonly empty: string;
  /** The delete button's accessible name; `{title}` is the row's title. */
  readonly delete: string;
  /** The inline confirm's question. */
  readonly deleteConfirm: string;
  /** The inline confirm's yes. */
  readonly deleteYes: string;
  /** The inline confirm's no. */
  readonly deleteNo: string;
  /** What a screen reader hears for each mark; idle says nothing. */
  readonly status: Readonly<Record<Exclude<ThreadStatus, "idle">, string>>;
}

/** What the `strings` setter takes: any of {@link ThreadsStrings}, `status` per mark too. */
export type ThreadsStringsInput = Partial<Omit<ThreadsStrings, "status">> & {
  readonly status?: Partial<ThreadsStrings["status"]>;
};
