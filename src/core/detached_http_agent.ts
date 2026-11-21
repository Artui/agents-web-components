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

/** Config for {@link DetachedHttpAgent}: an `HttpAgent`'s, plus where its thread's run log is. */
export interface DetachedHttpAgentConfig extends HttpAgentConfig {
  /**
   * The thread's `threads/<id>/events/` route (django-ag-ui 0.82.0+), or
   * absent when the element has no run log to read, which leaves
   * {@link DetachedHttpAgent.connectAgent} the base agent's no-op.
   */
  readonly eventsUrl?: string;
}

/**
 * An `HttpAgent` that can join a run already in flight on its thread.
 *
 * `connectAgent()` reads the run's log from the start (`?after=0`) as an AG-UI
 * stream, so the replay goes through the client's own enforcement, verification
 * and subscribers exactly as a run's stream does. Every request, the replay's
 * included, goes through the configured `fetch`, which is where the element's
 * header overlay, cookie policy and cross-origin notice live.
 *
 * `eventsUrl` is a plain public field rather than a private one because
 * `clone()` builds the copy without running field initialisers.
 */
export class DetachedHttpAgent extends HttpAgent {
  eventsUrl: string | undefined;

  constructor(config: DetachedHttpAgentConfig) {
    super(config);
    this.eventsUrl = config.eventsUrl;
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
    if (this.eventsUrl === undefined) {
      return super.connect(input);
    }
    const url = `${this.eventsUrl}?after=0`;
    const init: RequestInit = {
      method: "GET",
      headers: { ...this.headers, Accept: "text/event-stream" },
      signal: this.abortController.signal,
    };
    return transformHttpEventStream(
      runHttpRequest(() => this.fetch(url, init)),
      this.debugLogger,
    );
  }

  override clone(): DetachedHttpAgent {
    const cloned = super.clone() as DetachedHttpAgent;
    cloned.eventsUrl = this.eventsUrl;
    return cloned;
  }
}
