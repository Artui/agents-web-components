/** `detail` shape of the {@link OPEN_THREAD_EVENT} CustomEvent. */
export interface OpenThreadDetail {
  /**
   * The agent the thread belongs to, as the server named it: a child-session
   * receipt's `agent_id`, or a parent's store `scope`. `null` when the server
   * named none (a parent in an unscoped store), which means this chat's own.
   */
  readonly agentId: string | null;
  /** The thread to open. */
  readonly threadId: string;
}
