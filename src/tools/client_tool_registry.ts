import type { Tool } from "@ag-ui/core";

/** Draws one call from its arguments alone; the replay path takes this, never a `handler`. */
export type ChartRenderer = (args: Record<string, unknown>) => Node | null;

/**
 * A tool the frontend declares and executes itself.
 *
 * `parameters` is a JSON Schema (and may carry the `x-destructive` extension).
 * `handler` receives the parsed arguments and returns a result that is
 * JSON-serialised into the AG-UI tool-result message sent back to the agent.
 */
export interface ClientTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /**
   * Run the tool. `callId` identifies the call being executed, for a handler
   * that renders into the transcript and needs to place itself against its own
   * card; handlers that only act on the page ignore it.
   */
  handler: (args: Record<string, unknown>, callId?: string) => unknown | Promise<unknown>;
  /**
   * Draw this call, from its arguments alone.
   *
   * Optional, and the only half that is replayed: a restored transcript calls
   * `render`, never {@link handler}, so a reload cannot re-run an effect.
   *
   * It runs again on every restore, so it must be:
   *
   * - a pure function of `args` — no host state, no network, no clock;
   * - deterministic, so a reload reproduces what was there before;
   * - free of effects outside the node it returns, which the component places.
   *
   * Return `null` for arguments that say nothing worth drawing.
   */
  render?: ChartRenderer;
}

/**
 * Holds the frontend tools a host has declared on an `<ag-ui-chat>` element.
 *
 * Produces AG-UI {@link Tool} definitions for `RunAgentInput.tools` and looks
 * up handlers when the agent calls a tool. Pure (no DOM); the element owns one
 * instance.
 */
export class ClientToolRegistry {
  readonly #tools = new Map<string, ClientTool>();

  /**
   * Register a tool, replacing any existing one with the same name.
   *
   * Replacing rather than throwing keeps a re-fired host ref or StrictMode double-invoke safe.
   */
  register(tool: ClientTool): void {
    this.#tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.#tools.has(name);
  }

  /** Return a registered tool or throw. */
  get(name: string): ClientTool {
    const tool = this.#tools.get(name);
    if (tool === undefined) {
      throw new Error(`tool "${name}" is not registered`);
    }
    return tool;
  }

  /** AG-UI tool definitions for `RunAgentInput.tools`. */
  tools(): Tool[] {
    return [...this.#tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}
