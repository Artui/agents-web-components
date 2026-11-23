import {
  AGENT_CHANGE_EVENT,
  AGENTS_CHANGE_EVENT,
  ELEMENT_TAG,
  INBOX_CHANGE_EVENT,
} from "../constants.js";
import { type ClientConversationStore, SessionStorageStore } from "../core/conversation_store.js";
import { RemoteConversationStore } from "../core/remote_conversation_store.js";
import { ThreadsWatch } from "../core/threads_watch.js";
import { withCredentials } from "../core/utils.js";
import { AgentStore } from "./agent_store.js";
import type {
  AgentChangeDetail,
  AgentEntry,
  AgentsChangeDetail,
  AgentsChat,
  InboxChangeDetail,
  InboxRow,
  InboxServerRow,
  InboxTransport,
} from "./types.js";

/** Each directory key that fills a chat attribute, and the attribute it fills. */
const CHAT_ATTRIBUTES = [
  ["endpoint", "endpoint"],
  ["tools_url", "data-tools-url"],
  ["threads_url", "data-threads-url"],
  ["runs_url", "data-runs-url"],
  ["skills_url", "data-skills-url"],
  ["skill_editor_url", "data-skill-editor-url"],
  ["attachments_url", "data-attachments-url"],
  ["transcribe_url", "data-transcribe-url"],
] as const satisfies readonly (readonly [keyof AgentEntry, string])[];

const CREDENTIALS_MODES: readonly string[] = ["omit", "same-origin", "include"];

/**
 * `<ag-ui-agents>`: a headless provider for an agents home. It reads the
 * directory of agents (`data-agents-url`) and keeps the inbox of every
 * agent's threads fresh (`data-inbox-url`, by ETag polling or SSE), and mounts
 * its chat on the entry `agent` names, the first entry by default.
 *
 * It draws nothing. Its chat is the `<ag-ui-chat>` inside it, or the one set
 * as {@link chat}. Switching agents remounts that chat: it is taken out of the
 * document, given the entry's URLs and a store scoped to the entry's id, and
 * put back, which is how a chat applies its connect-time attributes. A run in
 * flight is cancelled on the way out, as any remount cancels it.
 *
 * `<ag-ui-threads>` inside it, or naming it with `agents="<id>"`, lists the
 * conversations of the agent on screen. A lone `<ag-ui-chat>` needs none of
 * this and keeps working without a provider.
 */
export class AgUiAgents extends HTMLElement {
  static readonly observedAttributes = [
    "agent",
    "data-agents-url",
    "data-inbox-url",
    "data-inbox-transport",
  ];

  /** Static request headers for the directory and inbox requests. */
  headers: Record<string, string> = {};
  /** Live request headers, read per request and winning per key over {@link headers}. */
  getHeaders: (() => Record<string, string>) | null = null;

  #agents: readonly AgentEntry[] = [];
  #inbox: readonly InboxRow[] = [];
  #explicit: AgentsChat | null = null;
  /** The entry the chat was last mounted on, and the chat it was mounted on. */
  #mounted: AgentEntry | null = null;
  #mountedOn: AgentsChat | null = null;
  #directoryEtag: string | null = null;
  #inboxEtag: string | null = null;
  /** Bumped per directory listing and on disconnect, so a late answer is dropped. */
  #listing = 0;
  #unwatch: (() => void) | null = null;

  /** The directory as last listed. */
  get agents(): readonly AgentEntry[] {
    return this.#agents;
  }

  /** The inbox rows as last received, newest first. */
  get inbox(): readonly InboxRow[] {
    return this.#inbox;
  }

  /**
   * The id of the entry the chat is mounted on, or `null` before the directory
   * is listed. Setting it mounts the chat on that entry.
   */
  get agent(): string | null {
    return this.#mounted?.id ?? null;
  }

  set agent(id: string) {
    this.setAttribute("agent", id);
  }

  /** The chat this provider mounts: the one set here, else the first `<ag-ui-chat>` inside it. */
  get chat(): AgentsChat | null {
    return this.#explicit ?? this.querySelector<AgentsChat>(ELEMENT_TAG);
  }

  set chat(chat: AgentsChat | null) {
    this.#explicit = chat;
    this.#select();
  }

  /** The cookie policy of the directory and inbox requests, as on `<ag-ui-chat>`. */
  get credentials(): RequestCredentials | null {
    const mode = this.getAttribute("credentials");
    return mode !== null && CREDENTIALS_MODES.includes(mode) ? (mode as RequestCredentials) : null;
  }

  connectedCallback(): void {
    void this.refresh();
    this.#watchInbox();
  }

  disconnectedCallback(): void {
    this.#listing += 1;
    this.#stopInbox();
  }

  attributeChangedCallback(name: string): void {
    if (name === "agent") {
      this.#select();
    } else if (name === "data-agents-url") {
      this.#directoryEtag = null;
      if (this.isConnected) {
        void this.refresh();
      }
    } else {
      this.#watchInbox();
    }
  }

  /** List the directory again, and mount the chat if the entry it should be on changed. */
  async refresh(): Promise<void> {
    const url = this.getAttribute("data-agents-url");
    if (url === null || url === "") {
      return;
    }
    this.#listing += 1;
    const listing = this.#listing;
    const response = await this.#get(url, this.#directoryEtag);
    let agents: readonly AgentEntry[] | null = null;
    if (response?.ok === true) {
      try {
        agents = ((await response.json()) as { agents?: readonly AgentEntry[] }).agents ?? [];
      } catch {
        agents = null;
      }
    }
    if (agents === null || listing !== this.#listing) {
      return;
    }
    this.#directoryEtag = (response as Response).headers.get("ETag");
    this.#agents = agents;
    this.#emit<AgentsChangeDetail>(AGENTS_CHANGE_EVENT, { agents });
    this.#select();
  }

  /** Mount the chat on `agentId` and open `threadId` there, as an inbox row asks. */
  async openThread(agentId: string, threadId: string): Promise<void> {
    this.agent = agentId;
    await this.chat?.switchThread(threadId);
  }

  #select(): void {
    const wanted = this.getAttribute("agent");
    const entry =
      wanted === null ? this.#agents[0] : this.#agents.find((agent) => agent.id === wanted);
    if (entry === undefined) {
      if (wanted !== null && this.#agents.length > 0) {
        console.warn(`<ag-ui-agents>: agent="${wanted}" is not in the directory.`);
      }
      return;
    }
    const chat = this.chat;
    if (sameMount(entry, this.#mounted) && chat === this.#mountedOn) {
      return;
    }
    this.#mounted = entry;
    this.#mountedOn = chat;
    if (chat !== null) {
      remount(chat, entry);
    }
    this.#emit<AgentChangeDetail>(AGENT_CHANGE_EVENT, { agent: entry });
  }

  #watchInbox(): void {
    this.#stopInbox();
    const url = this.getAttribute("data-inbox-url");
    if (!this.isConnected || url === null || url === "") {
      return;
    }
    const transport: InboxTransport =
      this.getAttribute("data-inbox-transport") === "stream" ? "stream" : "poll";
    this.#unwatch = new ThreadsWatch({
      url,
      transport,
      headers: () => this.#headers(),
      credentials: () => this.credentials ?? undefined,
      poll: () => this.#pollInbox(url),
      seen: (etag) => {
        this.#inboxEtag = etag;
      },
      changed: (rows) => {
        this.#inbox = (rows as readonly InboxServerRow[]).map(toInboxRow);
        this.#emit<InboxChangeDetail>(INBOX_CHANGE_EVENT, { threads: this.#inbox });
      },
      etag: () => this.#inboxEtag,
    }).start();
  }

  #stopInbox(): void {
    this.#unwatch?.();
    this.#unwatch = null;
  }

  /** One inbox listing: rows when changed, `undefined` when unchanged, `null` on failure. */
  async #pollInbox(url: string): Promise<readonly InboxServerRow[] | null | undefined> {
    const response = await this.#get(url, this.#inboxEtag);
    if (response?.status === 304) {
      return undefined;
    }
    if (response?.ok !== true) {
      return null;
    }
    try {
      const body = (await response.json()) as { threads?: readonly InboxServerRow[] };
      this.#inboxEtag = response.headers.get("ETag");
      return body.threads ?? [];
    } catch {
      return null;
    }
  }

  /** GET with the live headers and the ETag last seen, or `null` on a network error. */
  async #get(url: string, etag: string | null): Promise<Response | null> {
    const headers = { ...this.#headers(), ...(etag === null ? {} : { "If-None-Match": etag }) };
    try {
      return await fetch(url, withCredentials({ headers }, this.credentials ?? undefined));
    } catch {
      return null;
    }
  }

  #headers(): Record<string, string> {
    return { ...this.headers, ...this.getHeaders?.() };
  }

  #emit<T>(type: string, detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
  }
}

/**
 * Put `chat` on `entry`: out of the document, its URLs and store set, and back
 * where it was. Set while detached, so none trips the connect-time warning.
 */
function remount(chat: AgentsChat, entry: AgentEntry): void {
  const parent = chat.parentNode;
  const next = chat.nextSibling;
  chat.remove();
  for (const [key, attribute] of CHAT_ATTRIBUTES) {
    const value = entry[key];
    if (value === null) {
      chat.removeAttribute(attribute);
    } else {
      chat.setAttribute(attribute, value);
    }
  }
  if (isBuiltinStore(chat.conversationStore)) {
    chat.conversationStore = new AgentStore(entry.id);
  }
  parent?.insertBefore(chat, next);
}

/** Whether `entry` puts the chat where `mounted` already has it: a re-listing remounts nothing. */
function sameMount(entry: AgentEntry, mounted: AgentEntry | null): boolean {
  return (
    mounted !== null &&
    entry.id === mounted.id &&
    CHAT_ATTRIBUTES.every(([key]) => entry[key] === mounted[key])
  );
}

/**
 * The chat's own store, or the remote it wrapped one in: the stores the
 * provider may replace. A store of the host's own kind keeps its own keying.
 */
function isBuiltinStore(store: ClientConversationStore): boolean {
  return store instanceof SessionStorageStore || store instanceof RemoteConversationStore;
}

function toInboxRow(row: InboxServerRow): InboxRow {
  const updatedAt = row.updated_at === null ? Number.NaN : Date.parse(row.updated_at);
  const base: InboxRow = {
    threadId: row.thread_id,
    agentId: row.agent_id,
    title: row.title,
    updatedAt,
    preview: row.preview,
  };
  if (row.status === undefined) {
    return base;
  }
  const lastRead = row.last_read_at;
  const unread =
    row.status !== "running" &&
    lastRead !== null &&
    lastRead !== undefined &&
    updatedAt > Date.parse(lastRead);
  return {
    ...base,
    status: row.status,
    unread,
    ...(row.status === "failed" && typeof row.reason === "string" ? { reason: row.reason } : {}),
    ...(row.status === "waiting" && row.interrupts !== undefined
      ? { interrupts: row.interrupts }
      : {}),
  };
}
