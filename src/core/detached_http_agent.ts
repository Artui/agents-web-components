import {
  type AgentSubscriber,
  HttpAgent,
  type HttpAgentConfig,
  type RunAgentParameters,
  type RunAgentResult,
  runHttpRequest,
  transformHttpEventStream,
} from "@ag-ui/client";
import type { RunAgentInput } from "@ag-ui/core";

/** Where a thread's run log is, read when it is needed; `undefined` when there is none. */
type RunLog = () => string | undefined;

/** Config for {@link DetachedHttpAgent}: an `HttpAgent`'s, plus where its thread's run log is. */
export interface DetachedHttpAgentConfig extends HttpAgentConfig {
  /**
   * The thread's `threads/<id>/events/` route (django-ag-ui 0.82.0+), or a
   * function read on each use that names it, or absent when the element has no
   * run log to read, which leaves {@link DetachedHttpAgent.connectAgent} the
   * base agent's no-op.
   */
  readonly eventsUrl?: string | RunLog;
}

/**
 * An `HttpAgent` that can join a run already in flight on its thread, and
 * follow a run a queued mount took off its start.
 *
 * `connectAgent()` reads the run's log from the start (`?after=0`) as an AG-UI
 * stream, so the replay goes through the client's own enforcement, verification
 * and subscribers exactly as a run's stream does. Every request, the replay's
 * included, goes through the configured `fetch`, which is where the element's
 * header overlay, cookie policy and cross-origin notice live.
 *
 * A mount with a firing queue (django-ag-ui 0.82.0+) answers a start that asks
 * to detach with `200 {thread_id, run_id}` rather than a stream, and leaves
 * the run to a worker. The start's answer is then exchanged for the run log
 * read from `?after=0`, so `runAgent()` streams the run as it would have
 * streamed the POST, and {@link followed} says that it did.
 *
 * `runLog` and `followed` are plain public fields rather than private ones
 * because `clone()` builds the copy without running field initialisers.
 */
export class DetachedHttpAgent extends HttpAgent {
  runLog: RunLog;
  /** Whether the last run's start was queued, and its stream is the run log's replay. */
  followed = false;

  constructor(config: DetachedHttpAgentConfig) {
    super(config);
    const log = config.eventsUrl;
    this.runLog = typeof log === "function" ? log : () => log;
    const send = this.fetch;
    const built: DetachedHttpAgent = this;
    // A method, not an arrow: `HttpAgent` calls it as `this.fetch(...)`, so a
    // clone, which copies the field, follows into its own run log. A free call
    // has no receiver, and is the agent's it was built on.
    this.fetch = function (this: DetachedHttpAgent | undefined, url, init) {
      return start(this ?? built, send, url, init);
    };
  }

  /** The thread's run log, as it is named now. */
  get eventsUrl(): string | undefined {
    return this.runLog();
  }

  /**
   * A fresh abort controller per connect, as `runAgent` makes one per run:
   * the base `connectAgent` makes none, so a Stop before it left the replay
   * born aborted, and `abortRun()` could not reach the replay's request.
   */
  override connectAgent(
    parameters?: RunAgentParameters,
    subscriber?: AgentSubscriber,
  ): Promise<RunAgentResult> {
    this.abortController = new AbortController();
    return super.connectAgent(parameters, subscriber);
  }

  protected override connect(input: RunAgentInput): ReturnType<HttpAgent["run"]> {
    const eventsUrl = this.eventsUrl;
    if (eventsUrl === undefined) {
      return super.connect(input);
    }
    return transformHttpEventStream(
      runHttpRequest(() => replay(this, (url, init) => this.fetch(url, init), eventsUrl)),
      this.debugLogger,
    );
  }

  override clone(): DetachedHttpAgent {
    const cloned = super.clone() as DetachedHttpAgent;
    cloned.runLog = this.runLog;
    cloned.followed = false;
    return cloned;
  }
}

/** The run log from its first event, as an AG-UI stream. */
function replay(
  agent: DetachedHttpAgent,
  send: HttpAgent["fetch"],
  eventsUrl: string,
): Promise<Response> {
  return send(`${eventsUrl}?after=0`, {
    method: "GET",
    headers: { ...agent.headers, Accept: "text/event-stream" },
    signal: agent.abortController.signal,
  });
}

/**
 * Make a request, and exchange a queued start's JSON answer for its run's log.
 *
 * Anything else is handed back as it came, a refusal included, which the base
 * agent reports with its status and body as it always has.
 */
async function start(
  agent: DetachedHttpAgent,
  send: HttpAgent["fetch"],
  url: string,
  init: RequestInit,
): Promise<Response> {
  if (init.method !== "POST") {
    return send(url, init);
  }
  agent.followed = false;
  const response = await send(url, init);
  const type = response.headers.get("Content-Type") ?? "";
  if (!response.ok || !type.includes("application/json")) {
    return response;
  }
  const answer = (await response.json()) as { thread_id?: unknown };
  const eventsUrl = agent.eventsUrl;
  if (eventsUrl === undefined || answer.thread_id !== agent.threadId) {
    throw new Error(
      `The server queued the run on thread "${String(answer.thread_id)}" for a worker, ` +
        "and this agent has no run log of that thread to follow it in: data-threads-url " +
        "is unset, or the answer names another thread.",
    );
  }
  agent.followed = true;
  return replay(agent, send, eventsUrl);
}
