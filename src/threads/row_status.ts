import { THREAD_STATUS, type ThreadStatus } from "../constants.js";
import type { LiveMarks } from "./live_marks.js";
import type { ThreadRow } from "./types.js";

/**
 * The one mark a row shows, most pressing first. The live chat answers for the
 * thread it is running and for what finished in this page; the row's own
 * `status` and `unread`, when a store supplies them, answer for the rest.
 * Nothing in the page can tell a thread is waiting, so only a store says so.
 */
export function rowStatus(row: ThreadRow, runningId: string | null, live: LiveMarks): ThreadStatus {
  if (row.threadId === runningId || row.status === "running") {
    return THREAD_STATUS.RUNNING;
  }
  if (row.status === "waiting") {
    return THREAD_STATUS.WAITING;
  }
  if (live.failed(row.threadId) || row.status === "failed") {
    return THREAD_STATUS.FAILED;
  }
  if (live.unread(row.threadId) || row.unread === true) {
    return THREAD_STATUS.UNREAD;
  }
  return THREAD_STATUS.IDLE;
}
