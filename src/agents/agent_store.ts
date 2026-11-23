import { SessionStorageStore } from "../core/conversation_store.js";

/** What prefixes an agent's storage namespace, so an entry id never meets an element id. */
const AGENT_NAMESPACE_PREFIX = "agent:";

/**
 * The built-in per-tab store, scoped to one directory entry.
 *
 * `<ag-ui-agents>` hands one to its chat while the chat is detached, before
 * mounting it on another agent. The chat's storage scope recognises it and
 * keeps the conversation under the agent's namespace rather than the
 * element's, `user-key` included, so each agent keeps its own thread pointer,
 * history drawer and messages when the chat moves between them.
 */
export class AgentStore extends SessionStorageStore {
  /** The {@link AgentEntry.id} this store keeps conversations for. */
  readonly agentId: string;

  constructor(agentId: string, namespace: string = AgentStore.namespaceOf(agentId)) {
    super(namespace);
    this.agentId = agentId;
  }

  /** The storage namespace an agent's conversations live under, before any `user-key`. */
  static namespaceOf(agentId: string): string {
    return `${AGENT_NAMESPACE_PREFIX}${agentId}`;
  }
}
