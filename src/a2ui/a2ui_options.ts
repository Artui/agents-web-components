import type { A2uiErrorMessage } from "./core/a2ui_error_message.js";

/** How `registerA2ui` is set up. */
export interface A2uiOptions {
  /**
   * Hears each A2UI `error` message a live surface raises, once per draw of
   * the surface: a redraw with new content reports again. Neither the A2UI
   * middleware nor django-ag-ui carries an error back to the agent yet, so it
   * goes to the host; the default is `console.warn`.
   */
  readonly onError?: (message: A2uiErrorMessage) => void;
}
