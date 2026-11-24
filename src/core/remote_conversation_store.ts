import type { Interrupt, Message } from "@ag-ui/core";
import {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
  type ThreadMeta,
  type ThreadParent,
  type ThreadRoutine,
  type ThreadStatus,
  type ThreadsTransport,
  threadTitleFrom,
} from "./conversation_store.js";
import { ThreadsWatch } from "./threads_watch.js";
import { mintThread, withCredentials } from "./utils.js";
import { type MaybeAsync, whenReady } from "./when_ready.js";

/**
 * One row of the server thread index (django-ag-ui's `ThreadsView` wire shape).
 * The status keys come from 0.84.0 on, and only from a mount with a run store.
 */
export interface ServerThreadRow {
  readonly thread_id: string;
  readonly title: string;
  readonly updated_at: string | null;
  readonly preview: string;
  readonly status?: ThreadStatus;
  readonly last_read_at?: string | null;
  readonly reason?: string | null;
  readonly interrupts?: readonly Interrupt[];
  readonly parent?: unknown;
  readonly routine?: unknown;
}

/** What a listing answered: the rows, or `null` when the list could not be read. */
type Listing = readonly ServerThreadRow[] | null;

const PROVISIONAL_TITLE = "New conversation";

/**
 * Live header source, read per request so rotated tokens / CSRF reach the
 * server; a Promise is awaited, and its rejection fails that request.
 */
type HeadersProvider = () => MaybeAsync<Record<string, string>>;

/**
 * Live cookie policy, read per request. A provider rather than a value: the
 * store is built once on connect, but a host may configure the element after
 * inserting it, and a captured value would pin that first frame's setting.
 */
type CredentialsProvider = () => RequestCredentials | undefined;

/**
 * A {@link ClientConversationStore} backed by a server thread-index endpoint —
 * django-ag-ui's owner-scoped `ThreadsView`, the URL passed to `<ag-ui-chat>`
 * as `data-threads-url`:
 *
 * - `GET  <url>`        → list the user's threads (metadata only);
 * - `GET  <url><id>/`   → that thread's messages;
 * - `PATCH <url><id>/`  → rename (`{ "title": … }`);
 * - `DELETE <url><id>/` → delete.
 *
 * Wraps a local store (default {@link SessionStorageStore}) for the client-only
 * concerns — active thread id, navigation checkpoint, message cache — and as
 * the fallback when a request fails. Rename and delete apply optimistically via
 * a local overlay, so the drawer reflects them before the fire-and-forget
 * round-trip lands.
 *
 * Pass `cacheMessages: false` to keep message bodies out of the browser
 * entirely; see the constructor.
 */
export class RemoteConversationStore implements ClientConversationStore {
  readonly #url: string;
  readonly #headers: HeadersProvider;
  readonly #local: ClientConversationStore;
  readonly #credentials: CredentialsProvider;
  readonly #cacheMessages: boolean;
  readonly #dropped = new Set<string>();
  readonly #renamed = new Map<string, string>();
  /**
   * The row each thread saved here would have, held in memory until the server
   * lists it. Derived from what was sent rather than read from the local store,
   * which holds no body (and so no title) when `cacheMessages` is off.
   */
  readonly #provisional = new Map<string, ThreadMeta>();
  /** The active id as last read or set through this store; listing must not mint one. */
  #active: string | null = null;
  /** The last list the server sent and its ETag, which a `304` confirms. */
  #listed: { readonly etag: string; readonly rows: readonly ServerThreadRow[] } | null = null;
  /** Whether the last list carried status, so the server mounts the read route. */
  #statusServed = false;
  /** Each thread read here, with the `updatedAt` it was read at: read until it moves on. */
  readonly #readAt = new Map<string, number>();

  /**
   * @param cacheMessages Whether to mirror message bodies into the local store.
   *
   * `true` (the default, and the behaviour this class has always had) keeps a
   * local copy of every turn, so the transcript still replays when the thread
   * endpoint is unreachable. `false` is for the deployment that chose a
   * server-backed store precisely so transcripts do not sit in the browser:
   * regulated content, a shared workstation, an operator who has to be able to
   * say where the conversation lives. It is not the same as passing a local
   * store that does nothing — the local store also owns the active thread id,
   * the navigation checkpoint and the "nothing sent here yet" marker, all of
   * which must keep working — so the opt-out is scoped to the bodies alone.
   *
   * The cost is deliberate and worth stating: with no local copy there is
   * nothing to fall back to, so a failed request shows an empty transcript
   * rather than a stale one, and the drawer's offline list loses its previews
   * (a preview is an excerpt of a message, which is the very thing being kept
   * off the client).
   */
  constructor(
    url: string,
    headers: HeadersProvider = () => ({}),
    local: ClientConversationStore = new SessionStorageStore(),
    credentials: CredentialsProvider = () => undefined,
    cacheMessages = true,
  ) {
    this.#url = url.endsWith("/") ? url : `${url}/`;
    this.#headers = headers;
    this.#local = local;
    this.#credentials = credentials;
    this.#cacheMessages = cacheMessages;
  }

  /** The store this one keeps the client-only state in: the thread pointer and checkpoints. */
  get local(): ClientConversationStore {
    return this.#local;
  }

  threadId(): string {
    this.#active = this.#local.threadId();
    return this.#active;
  }

  setActiveThread(threadId: string): void {
    this.#local.setActiveThread(threadId);
    this.#active = threadId;
  }

  /**
   * Delegated to the local store, which owns the active id — and deliberately
   * silent on the wire: the server learns of a thread when its first message is
   * persisted, so an abandoned new chat costs no round-trip and leaves no row.
   */
  newThread(): string {
    this.#active = mintThread(this.#local);
    return this.#active;
  }

  /** Delegated, so wrapping a store does not lose what it knows about its own ids. */
  isUnsent(threadId: string): boolean {
    return this.#local.isUnsent?.(threadId) === true;
  }

  saveMessages(threadId: string, messages: readonly Message[]): void {
    // The agent run persists server-side; keep a local cache for offline replay
    // unless the host asked for the bodies to stay off the client.
    //
    // The empty list is not a way of saying "nothing happened". A save is what
    // retires the local store's minted marker, and `loadMessages` skips the
    // server for a thread that store still calls unsent — so dropping the call
    // entirely would leave every thread permanently unsent and its history
    // unreachable after a reload. Saving an empty list records that the thread
    // is real without recording a word of what was said in it.
    this.#local.saveMessages(threadId, this.#cacheMessages ? messages : []);
    this.#provisional.set(threadId, {
      threadId,
      title: threadTitleFrom(messages) || PROVISIONAL_TITLE,
      updatedAt: Date.now(),
      preview: "",
    });
  }

  loadCheckpoint(threadId: string): NavigationCheckpoint | null {
    return this.#local.loadCheckpoint(threadId);
  }

  saveCheckpoint(threadId: string, checkpoint: NavigationCheckpoint | null): void {
    this.#local.saveCheckpoint(threadId, checkpoint);
  }

  renameThread(threadId: string, title: string): void {
    this.#local.renameThread(threadId, title);
    this.#renamed.set(threadId, title);
    void this.#mutate(threadId, "PATCH", { title });
  }

  clear(threadId: string): void {
    this.#local.clear(threadId);
    this.#dropped.add(threadId);
    this.#provisional.delete(threadId);
    void this.#mutate(threadId, "DELETE");
  }

  async listThreads(): Promise<readonly ThreadMeta[]> {
    const rows = await this.#fetchThreads();
    if (rows === null) {
      return this.#local.listThreads();
    }
    return this.#metasFrom(rows);
  }

  /**
   * Record a read on the server, through django-ag-ui's
   * `POST <url><id>/read/`, and read the thread as read here until it changes.
   *
   * Sent only once a listing carried `status`: the route is mounted only
   * beside a run store, and posting to a server without one would answer
   * `404` for every answer the user watched arrive.
   */
  markRead(threadId: string): void {
    const listed = this.#listed?.rows.find((row) => row.thread_id === threadId);
    if (listed !== undefined) {
      this.#readAt.set(threadId, updatedAtOf(listed));
    }
    if (this.#statusServed) {
      void this.#mutate(threadId, "POST", undefined, "read/");
    }
  }

  /**
   * Keep the list fresh: `poll` asks every five seconds with the ETag, and
   * `stream` follows the same URL as Server-Sent Events, which django-ag-ui
   * answers (0.84.0, under ASGI) with a frame each time the list changes.
   */
  watchThreads(
    listener: (threads: readonly ThreadMeta[]) => void,
    transport: ThreadsTransport,
  ): () => void {
    // The list this watch last handed on, by ETag: every listing of this store
    // writes the one it saw, so a change another listing saw first is still
    // handed on, and a stream reconnects from what this watch has shown.
    let handed: string | null | undefined;
    const watch = new ThreadsWatch({
      url: this.#url,
      transport,
      headers: this.#headers,
      credentials: this.#credentials,
      poll: async () => {
        const rows = await this.#fetchThreads();
        const listed = this.#listed;
        if (rows === null) {
          return null;
        }
        if (listed === null) {
          handed = null;
          return rows;
        }
        if (listed.etag === handed) {
          return undefined;
        }
        handed = listed.etag;
        return listed.rows;
      },
      seen: (etag, rows) => {
        this.#seen(etag, rows);
        handed = etag;
      },
      changed: (rows) => listener(this.#metasFrom(rows)),
      etag: () => handed ?? null,
    });
    return watch.start();
  }

  /**
   * The interrupts the server lists `threadId` as waiting on, asked again with
   * the ETag so a run answered elsewhere is not offered here. A server whose
   * listing carried no `status` has no run store, so it is not asked.
   */
  async waitingInterrupts(threadId: string): Promise<readonly Interrupt[]> {
    if (this.#listed !== null && !this.#statusServed) {
      return [];
    }
    // django-ag-ui lists interrupts only on a waiting row.
    const row = (await this.#fetchThreads())?.find((listed) => listed.thread_id === threadId);
    return row?.interrupts ?? [];
  }

  #seen(etag: string | null, rows: readonly ServerThreadRow[]): void {
    this.#statusServed = rows.some((row) => row.status !== undefined);
    this.#listed = etag === null ? null : { etag, rows };
  }

  #metasFrom(rows: readonly ServerThreadRow[]): readonly ThreadMeta[] {
    const metas = rows
      .filter((row) => !this.#dropped.has(row.thread_id))
      .map((row) => this.#toMeta(row));
    const pending = this.#pendingRow(rows);
    return pending === null ? metas : [pending, ...metas];
  }

  /**
   * The thread on screen as a provisional row, while the server's index does
   * not have it yet: sent from here, not deleted since, and not yet listed.
   * Once the server lists a thread, its row is the only one.
   */
  #pendingRow(rows: readonly ServerThreadRow[]): ThreadMeta | null {
    for (const listed of rows) {
      this.#provisional.delete(listed.thread_id);
    }
    const row = this.#active === null ? undefined : this.#provisional.get(this.#active);
    if (row === undefined) {
      return null;
    }
    return { ...row, title: this.#renamed.get(row.threadId) ?? row.title };
  }

  async loadMessages(threadId: string): Promise<readonly Message[] | null> {
    // Don't ask the server for a thread it cannot have, which would answer
    // `404` on every first visit; see `ClientConversationStore.isUnsent`.
    if (this.#local.isUnsent?.(threadId) === true) {
      return null;
    }
    const response = await this.#get(`${this.#url}${encodeURIComponent(threadId)}/`);
    if (response === null || !response.ok) {
      return this.#local.loadMessages(threadId);
    }
    // A 200 whose body isn't JSON (a proxy's HTML error page, a truncated
    // stream) must not throw an unhandled rejection that the caller's
    // `void rehydrate()` swallows; fall back to the local cache.
    const body = await this.#readJson<{ messages?: readonly Message[] }>(response);
    if (body === null) {
      return this.#local.loadMessages(threadId);
    }
    return body.messages ?? null;
  }

  async #fetchThreads(): Promise<Listing> {
    const listed = this.#listed;
    const response = await this.#get(
      this.#url,
      listed === null ? {} : { "If-None-Match": listed.etag },
    );
    if (response !== null && response.status === 304 && listed !== null) {
      return listed.rows;
    }
    if (response === null || !response.ok) {
      return null;
    }
    const body = await this.#readJson<{ threads?: readonly ServerThreadRow[] }>(response);
    if (body === null) {
      return null;
    }
    const rows = body.threads ?? [];
    this.#seen(response.headers.get("ETag"), rows);
    return rows;
  }

  /** Parse a `Response` body as JSON, or `null` when it isn't valid JSON. */
  async #readJson<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  #toMeta(row: ServerThreadRow): ThreadMeta {
    const updatedAt = updatedAtOf(row);
    const meta: ThreadMeta = {
      threadId: row.thread_id,
      title: this.#renamed.get(row.thread_id) ?? row.title,
      updatedAt,
      preview: row.preview,
      ...parentOf(row),
      ...routineOf(row),
    };
    if (row.status === undefined) {
      return meta;
    }
    return {
      ...meta,
      status: row.status,
      unread: this.#unread(row, updatedAt),
      ...(row.status === "failed" && typeof row.reason === "string" ? { reason: row.reason } : {}),
      ...(row.status === "waiting" && row.interrupts !== undefined
        ? { interrupts: row.interrupts }
        : {}),
    };
  }

  /**
   * Changed since it was last read, by the server's clock on both sides, and
   * not still being written. A thread never read reads as not unread: the
   * server sets no mark until a thread is read once, so every thread from
   * before the mark existed would otherwise read as new.
   */
  #unread(row: ServerThreadRow, updatedAt: number): boolean {
    const lastRead = row.last_read_at;
    if (row.status === "running" || lastRead === null || lastRead === undefined) {
      return false;
    }
    const readHere = this.#readAt.get(row.thread_id);
    if (readHere !== undefined && updatedAt <= readHere) {
      return false;
    }
    return updatedAt > Date.parse(lastRead);
  }

  /** GET that resolves to the `Response`, or `null` on a network error. */
  async #get(url: string, extra: Record<string, string> = {}): Promise<Response | null> {
    try {
      return await whenReady(this.#headers(), (headers) =>
        fetch(url, withCredentials({ headers: { ...headers, ...extra } }, this.#credentials())),
      );
    } catch {
      return null;
    }
  }

  /** Fire a best-effort write to the thread endpoint; failures are tolerated. */
  async #mutate(
    threadId: string,
    method: "PATCH" | "DELETE" | "POST",
    body?: { title: string },
    route = "",
  ): Promise<void> {
    const source = this.#headers();
    try {
      await whenReady(source, (headers) =>
        fetch(
          `${this.#url}${encodeURIComponent(threadId)}/${route}`,
          withCredentials(
            {
              method,
              headers:
                body === undefined ? headers : { ...headers, "content-type": "application/json" },
              body: body === undefined ? null : JSON.stringify(body),
            },
            this.#credentials(),
          ),
        ),
      );
    } catch {
      // Best-effort; the optimistic overlay keeps the drawer consistent.
    }
  }
}

/**
 * A row's `updated_at` as epoch ms. `null` and an unparseable date both become
 * NaN, Date.parse's own signal, which `relativeTime` renders as a neutral label
 * rather than an epoch-0 or NaN duration.
 */
function updatedAtOf(row: ServerThreadRow): number {
  return row.updated_at === null ? Number.NaN : Date.parse(row.updated_at);
}

/**
 * A child row's `parent` as {@link ThreadMeta.parent}, spread into the meta, or
 * nothing for a top-level row. Narrowed off the wire rather than trusted: a row
 * whose parent has no thread id is listed as top-level, and a scope that is not
 * a string is read as unscoped.
 */
function parentOf(row: ServerThreadRow): { parent?: ThreadParent } {
  const parent: unknown = row.parent;
  if (typeof parent !== "object" || parent === null) {
    return {};
  }
  const { thread_id: threadId, scope } = parent as Record<string, unknown>;
  if (typeof threadId !== "string" || threadId === "") {
    return {};
  }
  return { parent: { threadId, scope: typeof scope === "string" ? scope : null } };
}

/**
 * The routine that fired a row's thread as {@link ThreadMeta.routine}, or nothing
 * when the row names none. A routine without a string id and name is ignored.
 */
function routineOf(row: ServerThreadRow): { routine?: ThreadRoutine } {
  const routine: unknown = row.routine;
  if (typeof routine !== "object" || routine === null) {
    return {};
  }
  const { id, name } = routine as Record<string, unknown>;
  if (typeof id !== "string" || typeof name !== "string") {
    return {};
  }
  return { routine: { id, name } };
}
