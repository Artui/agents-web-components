import { AGENTS_TAG } from "../constants.js";
import { AgUiAgents } from "./ag_ui_agents.js";

/**
 * Register the `<ag-ui-agents>` Custom Element.
 *
 * Idempotent, and throws naming the tag when another class holds it, as
 * `defineChat` does and for the same reason: two copies on one page.
 */
export function defineAgents(): void {
  const existing = customElements.get(AGENTS_TAG);
  if (existing === undefined) {
    customElements.define(AGENTS_TAG, AgUiAgents);
  } else if (existing !== AgUiAgents) {
    throw new Error(
      `<${AGENTS_TAG}> is already defined by another class: ` +
        "a second copy of this package, or another package, is on the page",
    );
  }
}
