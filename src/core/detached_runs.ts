import { withCredentials } from "./utils.js";
import { type MaybeAsync, whenReady } from "./when_ready.js";

/** Headers for a request to `url`, read per request so rotated tokens and CSRF go with it. */
type HeadersFor = (url: string) => MaybeAsync<Record<string, string>>;

/** A thread's current or last run, as its run log's JSON page names it. */
export interface RunProbe {
  readonly runId: string;
  readonly status: string;
}

/** Live cookie policy, read per request; see `RemoteConversationStore`'s note. */
type CredentialsProvider = () => RequestCredentials | undefined;

/**
 * The two routes django-ag-ui (0.82.0+) serves beside each thread for a run
 * that outlives its connection, derived from the `data-threads-url` the
 * element already has, as {@link RunIndex} derives resume and fork from
 * `data-runs-url`:
 *
 * - `GET <url><id>/events/` is the run log, which a reattach replays and
 *   {@link probe} asks as a JSON page;
 * - `POST <url><id>/cancel/` records a cancel the run acts on at its next
 *   lease renewal.
 *
 * String surgery rather than `new URL`, because the configured value is
 * usually root-relative and `new URL` needs an absolute base.
 */
export class DetachedRuns {
  readonly #url: string;
  readonly #headers: HeadersFor;
  readonly #credentials: CredentialsProvider;

  constructor(threadsUrl: string, headers: HeadersFor, credentials: CredentialsProvider) {
    this.#url = threadsUrl.endsWith("/") ? threadsUrl : `${threadsUrl}/`;
    this.#headers = headers;
    this.#credentials = credentials;
  }

  /** The thread's run log. */
  eventsUrl(threadId: string): string {
    return `${this.#url}${encodeURIComponent(threadId)}/events/`;
  }

  /**
   * The thread's current or last run, from one JSON page of its log: its
   * `run_id` and `status`, or `null` for a `404`, any other failure or fault.
   *
   * Asked of the server rather than remembered, so it holds across an element
   * a tab host unmounted while the run went on.
   */
  async probe(threadId: string): Promise<RunProbe | null> {
    const url = `${this.eventsUrl(threadId)}?after=0&limit=1`;
    try {
      const response = await whenReady(this.#headers(url), (headers) =>
        fetch(
          url,
          withCredentials(
            { method: "GET", headers: { ...headers, Accept: "application/json" } },
            this.#credentials(),
          ),
        ),
      );
      if (!response.ok) {
        return null;
      }
      const page = (await response.json()) as { run_id?: unknown; status?: unknown };
      return { runId: String(page.run_id), status: String(page.status) };
    } catch {
      return null;
    }
  }

  /**
   * Ask the server to stop the thread's run. Best-effort: a `404` means the run
   * had already ended, which is what was asked for, and a fault leaves the
   * run to its own timeout, so neither is reported.
   */
  async cancel(threadId: string): Promise<void> {
    const url = `${this.#url}${encodeURIComponent(threadId)}/cancel/`;
    try {
      await whenReady(this.#headers(url), (headers) =>
        fetch(url, withCredentials({ method: "POST", headers }, this.#credentials())),
      );
    } catch {
      // Best-effort; see above.
    }
  }
}
