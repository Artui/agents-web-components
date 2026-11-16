import { A2UI_CATALOG } from "./a2ui/a2ui_catalog.js";
import { A2UI_CONTEXT_DESCRIPTION } from "./a2ui/a2ui_context_description.js";
import type { A2uiHost } from "./a2ui/a2ui_host.js";
import type { A2uiOptions } from "./a2ui/a2ui_options.js";
import { a2uiRenderer } from "./a2ui/a2ui_renderer.js";
import { actionRequest } from "./a2ui/action_request.js";
import { randomRunId } from "./a2ui/random_run_id.js";

/**
 * Draw A2UI 1.0 surfaces in `chat` and send their actions back.
 *
 * Registers the `a2ui-surface` activity renderer, posts this renderer's catalog
 * as the context entry the server reads its components from, and starts a run
 * with `forwardedProps.a2uiAction` for each action a live surface sends.
 * Returns the function that stops posting the catalog.
 */
export function registerA2ui(chat: A2uiHost, options: A2uiOptions = {}): () => void {
  const onError = options.onError ?? ((message) => console.warn("A2UI error", message));
  const catalog = JSON.stringify(A2UI_CATALOG);
  chat.registerActivityRenderer({
    type: "a2ui-surface",
    render: a2uiRenderer((action) => {
      void chat.run(actionRequest(action, randomRunId()));
    }, onError),
  });
  return chat.registerContext(() => [{ description: A2UI_CONTEXT_DESCRIPTION, value: catalog }]);
}
