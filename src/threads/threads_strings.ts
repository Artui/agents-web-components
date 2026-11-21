import type { ThreadsStrings } from "./types.js";

/** The list's English text; a host's `strings` is merged over it. */
export const DEFAULT_THREADS_STRINGS: ThreadsStrings = {
  label: "Conversations",
  untitled: "New conversation",
  empty: "No conversations yet",
  delete: "Delete {title}",
  deleteConfirm: "Delete this conversation?",
  deleteYes: "Delete",
  deleteNo: "Cancel",
  running: "Running",
  waiting: "Waiting",
  failed: "Failed",
  unread: "Unread",
};
