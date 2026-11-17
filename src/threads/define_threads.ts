import { THREADS_TAG } from "../constants.js";
import { AgUiThreads } from "./ag_ui_threads.js";

/**
 * Register the `<ag-ui-threads>` Custom Element.
 *
 * Idempotent, and throws naming the tag when another class holds it, as
 * `defineChat` does and for the same reason: two copies on one page.
 */
export function defineThreads(): void {
  const existing = customElements.get(THREADS_TAG);
  if (existing === undefined) {
    customElements.define(THREADS_TAG, AgUiThreads);
  } else if (existing !== AgUiThreads) {
    throw new Error(
      `<${THREADS_TAG}> is already defined by another class: ` +
        "a second copy of this package, or another package, is on the page",
    );
  }
}
