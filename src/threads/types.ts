import type { AgUiChat } from "../core/ag_ui_chat.js";
import type { ThreadMeta } from "../core/conversation_store.js";

/** A row as `<ag-ui-threads>` lists it: the chat store's {@link ThreadMeta}. */
export type ThreadRow = ThreadMeta;

/**
 * The part of `<ag-ui-chat>` the list drives: its public thread API and the
 * store it lists from. Typed from the element itself so the two cannot drift.
 */
export type ThreadsChat = HTMLElement &
  Pick<AgUiChat, "threadId" | "conversationStore" | "switchThread" | "deleteThread">;

/** How the list is drawn: rows down a rail, or a strip of pills for a bar; both delete. */
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
  /** The mark on a row whose run works now. */
  readonly running: string;
  /** The mark on a row whose run waits on a person. */
  readonly waiting: string;
  /** The mark on a row whose last run failed. */
  readonly failed: string;
  /** The mark on a row that changed since it was read. */
  readonly unread: string;
}

/** The mark a row carries, by precedence: what needs the user before what is merely new. */
export type ThreadsMark = "waiting" | "failed" | "running" | "unread";

/** What the `strings` setter takes: any of {@link ThreadsStrings}. */
export type ThreadsStringsInput = Partial<ThreadsStrings>;
