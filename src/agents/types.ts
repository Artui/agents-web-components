import type { AgUiChat } from "../core/ag_ui_chat.js";
import type { ThreadMeta, ThreadsTransport } from "../core/conversation_store.js";
import type { ServerThreadRow } from "../core/remote_conversation_store.js";

/**
 * One agent of the directory, as django-ag-ui's `AgentsDirectory` lists it
 * under `agents/`: its identity and one URL per route its mount serves, each
 * `null` for a route that mount does not serve.
 */
export interface AgentEntry {
  /** The mount's `id`; also the chat's storage namespace while it is mounted on this entry. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly endpoint: string;
  readonly tools_url: string | null;
  readonly threads_url: string | null;
  readonly runs_url: string | null;
  readonly skills_url: string | null;
  readonly skill_editor_url: string | null;
  readonly routines_url?: string | null;
  readonly attachments_url: string | null;
  readonly transcribe_url: string | null;
}

/** A thread row as `inbox/` lists it: a mount's `threads/` row, plus the agent it belongs to. */
export interface InboxServerRow extends ServerThreadRow {
  readonly agent_id: string;
}

/** An inbox row as `<ag-ui-agents>` hands it on: a {@link ThreadMeta}, plus its agent. */
export interface InboxRow extends ThreadMeta {
  /** The {@link AgentEntry.id} the thread belongs to. */
  readonly agentId: string;
}

/** How the inbox is kept fresh: `poll` (the default) asks with the ETag, `stream` follows SSE. */
export type InboxTransport = ThreadsTransport;

/** The part of `<ag-ui-chat>` the provider drives. */
export type AgentsChat = HTMLElement & Pick<AgUiChat, "conversationStore" | "switchThread">;

/** `detail` shape of the {@link AGENTS_CHANGE_EVENT} CustomEvent. */
export interface AgentsChangeDetail {
  readonly agents: readonly AgentEntry[];
}

/** `detail` shape of the {@link INBOX_CHANGE_EVENT} CustomEvent. */
export interface InboxChangeDetail {
  readonly threads: readonly InboxRow[];
}

/** `detail` shape of the {@link AGENT_CHANGE_EVENT} CustomEvent. */
export interface AgentChangeDetail {
  /** The entry the chat is now mounted on. */
  readonly agent: AgentEntry;
}
