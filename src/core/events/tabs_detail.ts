import type { ThreadTab } from "../thread_tabs.js";

/** `detail` shape of the {@link TABS_EVENT} CustomEvent. */
export interface TabsDetail {
  /** The open threads, in the order they were opened. */
  readonly tabs: readonly ThreadTab[];
  /**
   * What changed them:
   *
   * - `open`: `openTab()`, or a thread shown (a switch, a new chat) that had no tab.
   * - `close`: `closeTab()`; the thread stays in history.
   * - `delete`: an open thread was deleted, and its tab went with it.
   * - `title`: an open thread's title changed.
   * - `restore`: the stored set was read back, on connect or by `reload()`.
   * - `rescope`: a `user-key` handover replaced the set with the next user's.
   *
   * A closed set today; a host should ignore a reason it does not know.
   */
  readonly reason: "open" | "close" | "delete" | "title" | "restore" | "rescope";
}
