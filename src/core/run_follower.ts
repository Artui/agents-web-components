import type { ThreadMeta } from "./conversation_store.js";
import type { DetachedRuns } from "./detached_runs.js";

/** How often `data-poll-runs` asks the open thread's run log again. */
const INTERVAL_MS = 5000;

/** The run statuses a chat joins: one going, and one the server parked on a person. */
export type FollowedStatus = "running" | "waiting";

/** What a {@link RunFollower} needs from the element it follows runs for. */
export interface RunFollowerHost {
  /** The thread on screen, or `null` while it is one nothing was sent in. */
  readonly threadId: () => string | null;
  /** The run routes while `data-detach-runs` asks for them, else `null`. */
  readonly runs: () => DetachedRuns | null;
  /** Whether the chat is free to join a run: nothing of its own in flight. */
  readonly idle: () => boolean;
  /** Join the run on the thread on screen: follow one going, or offer one parked. */
  readonly join: (status: FollowedStatus) => void;
}

/**
 * Joins a run the server started on the thread a chat shows, such as a parent
 * thread a child's report woke: when the thread watch lists that thread as
 * `running` or `waiting` ({@link listed}), or on a poll of its run log
 * ({@link start}).
 *
 * Never a run this chat drove or already joined. The list row names no run,
 * so the run log's page is asked which run it is, and compared with the run
 * the chat's own stream last declared ({@link ran}): a server lets go of a run
 * a moment after its stream ends, and a list read in that moment still says
 * `running`. A thread holds one run at a time, so the id is the guard. A list
 * that arrives while the chat is busy is asked again once it is idle
 * ({@link idled}), since a watch hands on a list only when it changes. Every
 * probe goes through one chain, so a list never outruns that record.
 */
export class RunFollower {
  readonly #host: RunFollowerHost;
  #own: { readonly threadId: string; readonly runId: string } | null = null;
  /** A thread whose parked run a restore offered, whose id it was not told. */
  #offered: string | null = null;
  /** The thread a list named while the chat was busy, to ask again once it is idle. */
  #pending: string | null = null;
  #chain: Promise<void> = Promise.resolve();

  constructor(host: RunFollowerHost) {
    this.#host = host;
  }

  /** A list from the thread watch: follow the thread on screen if it lists as running or parked. */
  listed(threads: readonly ThreadMeta[]): void {
    const threadId = this.#host.threadId();
    const row = threads.find((thread) => thread.threadId === threadId);
    if (row === undefined || !followed(row.status)) {
      return;
    }
    if (this.#host.idle()) {
      this.#enqueue(() => this.#check(row.threadId));
    } else {
      this.#pending = row.threadId;
    }
  }

  /** The chat's own stream declared `runId` on `threadId`: that run is never joined. */
  ran(threadId: string, runId: string): void {
    this.#own = { threadId, runId };
    this.#offered = null;
  }

  /** A restore offered the run `threadId` is parked on: that run is the chat's own. */
  offered(threadId: string): void {
    this.#offered = threadId;
  }

  /** The chat has nothing of its own in flight again: ask again of a list it was busy for. */
  idled(): void {
    const threadId = this.#pending;
    this.#pending = null;
    if (threadId !== null) {
      this.#enqueue(() => this.#check(threadId));
    }
  }

  /** Poll the thread on screen's run log until the function returned is called. */
  start(): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      timer = setTimeout(() => {
        const threadId = this.#host.threadId();
        if (threadId !== null && this.#host.idle()) {
          this.#enqueue(() => this.#check(threadId));
        }
        tick();
      }, INTERVAL_MS);
    };
    tick();
    return () => clearTimeout(timer);
  }

  #enqueue(task: () => Promise<void>): void {
    this.#chain = this.#chain.then(task);
  }

  async #check(threadId: string): Promise<void> {
    const runs = this.#host.runs();
    if (runs === null) {
      return;
    }
    const page = await runs.probe(threadId);
    const status = page?.status;
    if (page === null || !followed(status)) {
      return;
    }
    const own = this.#own;
    if (own !== null && own.threadId === threadId && own.runId === page.runId) {
      return;
    }
    if (status === "waiting" && this.#offered === threadId) {
      this.#own = { threadId, runId: page.runId };
      return;
    }
    // Asked again after the probe: the person may have moved on, or sent.
    if (this.#host.threadId() !== threadId) {
      return;
    }
    if (!this.#host.idle()) {
      this.#pending = threadId;
      return;
    }
    this.#own = { threadId, runId: page.runId };
    this.#host.join(status);
  }
}

function followed(status: string | undefined): status is FollowedStatus {
  return status === "running" || status === "waiting";
}
