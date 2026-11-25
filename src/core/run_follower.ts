import type { ThreadMeta } from "./conversation_store.js";
import type { DetachedRuns } from "./detached_runs.js";

/** How often `data-poll-runs` asks the open thread's run log again. */
const INTERVAL_MS = 5000;

/** What a {@link RunFollower} needs from the element it follows runs for. */
export interface RunFollowerHost {
  /** The thread on screen, or `null` while it is one nothing was sent in. */
  readonly threadId: () => string | null;
  /** The run routes while `data-detach-runs` asks for them, else `null`. */
  readonly runs: () => DetachedRuns | null;
  /** Whether the chat is free to join a run: nothing of its own in flight. */
  readonly idle: () => boolean;
  /** Join the run in flight on the thread on screen. */
  readonly join: () => void;
}

/**
 * Joins a run the server started on the thread a chat shows, such as a parent
 * thread a child's report woke: when the thread watch lists that thread as
 * `running` ({@link listed}), or on a poll of its run log ({@link start}).
 *
 * Never a run this chat drove or already joined. The list row names no run,
 * so the run log's page is asked which run is going, and a chat whose own run
 * has just ended asks it once then too ({@link settled}): a server lets go of
 * a run a moment after its stream ends, and a list read in that moment still
 * says `running`. A thread holds one run at a time, so the id is the guard.
 * Every probe goes through one chain, so a list never outruns that record.
 */
export class RunFollower {
  readonly #host: RunFollowerHost;
  #own: { readonly threadId: string; readonly runId: string } | null = null;
  #chain: Promise<void> = Promise.resolve();

  constructor(host: RunFollowerHost) {
    this.#host = host;
  }

  /** A list from the thread watch: follow the thread on screen if it lists as running. */
  listed(threads: readonly ThreadMeta[]): void {
    const threadId = this.#host.threadId();
    const row = threads.find((thread) => thread.threadId === threadId);
    if (row?.status === "running" && this.#host.idle()) {
      this.#enqueue(() => this.#check(row.threadId));
    }
  }

  /** The chat's own run on the thread on screen ended: record which run that was. */
  settled(): void {
    const threadId = this.#host.threadId();
    const runs = this.#host.runs();
    if (threadId === null || runs === null) {
      return;
    }
    this.#enqueue(async () => {
      const page = await runs.probe(threadId);
      if (page !== null) {
        this.#own = { threadId, runId: page.runId };
      }
    });
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
    if (page?.status !== "running") {
      return;
    }
    const own = this.#own;
    if (own !== null && own.threadId === threadId && own.runId === page.runId) {
      return;
    }
    // Asked again after the probe: the person may have sent, or moved on.
    if (this.#host.threadId() !== threadId || !this.#host.idle()) {
      return;
    }
    this.#own = { threadId, runId: page.runId };
    this.#host.join();
  }
}
