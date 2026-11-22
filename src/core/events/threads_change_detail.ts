import type { ThreadMeta } from "../conversation_store.js";

/** `detail` shape of the {@link THREADS_CHANGE_EVENT} CustomEvent. */
export interface ThreadsChangeDetail {
  /** The thread list as the store now lists it, newest first. */
  readonly threads: readonly ThreadMeta[];
}
