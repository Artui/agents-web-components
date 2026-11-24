import type { ThreadsTransport } from "./conversation_store.js";
import type { ServerThreadRow } from "./remote_conversation_store.js";
import { withCredentials } from "./utils.js";
import { type MaybeAsync, whenReady } from "./when_ready.js";

/** How often a poll asks again, and how long a stream waits before it reconnects. */
const INTERVAL_MS = 5000;
const EVENT_STREAM = "text/event-stream";

/** What a {@link ThreadsWatch} needs from the store it watches for. */
export interface ThreadsWatchConfig {
  readonly url: string;
  readonly transport: ThreadsTransport;
  readonly headers: () => MaybeAsync<Record<string, string>>;
  readonly credentials: () => RequestCredentials | undefined;
  /** One listing: rows when changed, `undefined` when unchanged, `null` on failure. */
  readonly poll: () => Promise<readonly ServerThreadRow[] | null | undefined>;
  /** Record a list a stream frame (or a stream request's JSON answer) carried. */
  readonly seen: (etag: string | null, rows: readonly ServerThreadRow[]) => void;
  /** Hand on a list that changed. */
  readonly changed: (rows: readonly ServerThreadRow[]) => void;
  /** The ETag of the list last seen, which a reconnecting stream names. */
  readonly etag: () => string | null;
}

/**
 * One watch of a thread list, by ETag polling or by the server's SSE stream.
 *
 * The stream is read with `fetch` rather than `EventSource`, so the live
 * headers and cookie policy reach it as they reach every other request. It
 * reconnects when the server ends it (django-ag-ui does after five minutes, so
 * the caller is authenticated again), naming the last frame it saw, and a
 * server that answers the stream request with JSON (a WSGI deployment) is
 * polled from then on.
 */
export class ThreadsWatch {
  readonly #config: ThreadsWatchConfig;
  readonly #abort = new AbortController();
  #transport: ThreadsTransport;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ThreadsWatchConfig) {
    this.#config = config;
    this.#transport = config.transport;
  }

  /** Begin watching; the function returned stops it. */
  start(): () => void {
    this.#schedule(0);
    return () => {
      this.#abort.abort();
      if (this.#timer !== null) {
        clearTimeout(this.#timer);
      }
    };
  }

  #schedule(delay: number): void {
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void (this.#transport === "stream" ? this.#follow() : this.#pollOnce());
    }, delay);
  }

  async #pollOnce(): Promise<void> {
    const rows = await this.#config.poll();
    if (this.#abort.signal.aborted) {
      return;
    }
    if (rows !== null && rows !== undefined) {
      this.#config.changed(rows);
    }
    this.#schedule(INTERVAL_MS);
  }

  async #follow(): Promise<void> {
    const etag = this.#config.etag();
    const source = this.#config.headers();
    try {
      const response = await whenReady(source, (live) => {
        const headers: Record<string, string> = {
          ...live,
          Accept: EVENT_STREAM,
          ...(etag === null ? {} : { "Last-Event-ID": etag }),
        };
        return fetch(
          this.#config.url,
          withCredentials({ headers, signal: this.#abort.signal }, this.#config.credentials()),
        );
      });
      if (response.ok && response.body !== null) {
        await this.#read(response);
      }
    } catch {
      // A dropped connection or a stop; the stop is checked below.
    }
    if (!this.#abort.signal.aborted) {
      this.#schedule(INTERVAL_MS);
    }
  }

  /** Hand on each frame of a stream, or the one list of a JSON answer. */
  async #read(response: Response): Promise<void> {
    if (!(response.headers.get("content-type") ?? "").startsWith(EVENT_STREAM)) {
      this.#transport = "poll";
      const body = (await response.json()) as { threads?: readonly ServerThreadRow[] };
      this.#take(response.headers.get("ETag"), body.threads ?? []);
      return;
    }
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }
      buffered += decoder.decode(value, { stream: true });
      let end = buffered.indexOf("\n\n");
      while (end !== -1) {
        this.#frame(buffered.slice(0, end));
        buffered = buffered.slice(end + 2);
        end = buffered.indexOf("\n\n");
      }
    }
  }

  /** One SSE frame: `id:` is the list's ETag, `data:` the list; a comment is a heartbeat. */
  #frame(frame: string): void {
    let id: string | null = null;
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("id:")) {
        id = line.slice(3).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trimStart());
      }
    }
    if (data.length === 0) {
      return;
    }
    const body = JSON.parse(data.join("\n")) as { threads?: readonly ServerThreadRow[] };
    this.#take(id, body.threads ?? []);
  }

  #take(etag: string | null, rows: readonly ServerThreadRow[]): void {
    this.#config.seen(etag, rows);
    this.#config.changed(rows);
  }
}
