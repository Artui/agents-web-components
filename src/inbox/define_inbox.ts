import { INBOX_TAG } from "../constants.js";
import { AgUiInbox } from "./ag_ui_inbox.js";

/**
 * Register the `<ag-ui-inbox>` Custom Element.
 *
 * Idempotent, and throws naming the tag when another class holds it, as
 * `defineThreads` does and for the same reason: two copies on one page.
 */
export function defineInbox(): void {
  const existing = customElements.get(INBOX_TAG);
  if (existing === undefined) {
    customElements.define(INBOX_TAG, AgUiInbox);
  } else if (existing !== AgUiInbox) {
    throw new Error(
      `<${INBOX_TAG}> is already defined by another class: ` +
        "a second copy of this package, or another package, is on the page",
    );
  }
}
