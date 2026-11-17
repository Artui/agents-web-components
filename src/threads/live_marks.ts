import type { RunFinishedDetail } from "../core/events/run_finished_detail.js";
import type { UnreadDetail } from "../core/events/unread_detail.js";

/**
 * What the chat in this page has seen happen to each thread: which ended in a
 * failed run, and which hold an answer nobody has looked at. A store that
 * carries run state across tabs is read beside this; this is the part only the
 * live chat knows.
 */
export class LiveMarks {
  readonly #failed = new Set<string>();
  readonly #unread = new Set<string>();
  #unreadTotal = 0;

  /** Start from the chat's total, so the first change is read against it. */
  constructor(unreadTotal: number) {
    this.#unreadTotal = unreadTotal;
  }

  /** A failed run marks its thread; a run that completes or stops there clears it. */
  runFinished(detail: RunFinishedDetail): void {
    if (detail.outcome === "failed") {
      this.#failed.add(detail.threadId);
    } else {
      this.#failed.delete(detail.threadId);
    }
  }

  /** A run starting on a thread clears its failure: it is being tried again. */
  runStarted(threadId: string): void {
    this.#failed.delete(threadId);
  }

  /**
   * The chat names the threads a change touched, not which way: a rise in its
   * total is an answer landing unseen, and anything else is threads being read.
   */
  unreadChanged(detail: UnreadDetail): void {
    const marked = detail.unread > this.#unreadTotal;
    this.#unreadTotal = detail.unread;
    for (const threadId of detail.threadIds) {
      if (marked) {
        this.#unread.add(threadId);
      } else {
        this.#unread.delete(threadId);
      }
    }
  }

  /** Whether `threadId`'s last run here failed. */
  failed(threadId: string): boolean {
    return this.#failed.has(threadId);
  }

  /** Whether `threadId` holds an answer that landed here unseen. */
  unread(threadId: string): boolean {
    return this.#unread.has(threadId);
  }
}
