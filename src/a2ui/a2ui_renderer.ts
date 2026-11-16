import type { ActivityRenderer } from "../core/activity_renderer.js";
import { A2UI_CATALOG } from "./a2ui_catalog.js";
import { A2UI_STYLES } from "./a2ui_styles.js";
import { CATALOG_COMPONENTS } from "./catalog_components.js";
import type { A2uiErrorMessage } from "./core/a2ui_error_message.js";
import { applyOperations } from "./core/apply_operations.js";
import { idCounter } from "./core/id_counter.js";
import { isObject } from "./core/is_object.js";
import { notice } from "./core/notice.js";
import type { Surface } from "./core/surface.js";
import type { UserAction } from "./core/user_action.js";
import { BASIC_FUNCTIONS } from "./functions/basic_functions.js";

interface Drawn {
  readonly key: string;
  readonly surfaces: readonly Surface[];
}

/**
 * The `a2ui-surface` activity renderer: draws the surfaces an
 * `{a2ui_operations: [...]}` snapshot leaves, actions to `onAction` and, from a
 * live draw only, errors to `onError`.
 *
 * The same content drawn again returns the node already on screen, so a
 * surface being typed into keeps its values.
 */
export function a2uiRenderer(
  onAction: (action: UserAction) => void,
  onError: (message: A2uiErrorMessage) => void,
): ActivityRenderer {
  const drawn = new WeakMap<Node, Drawn>();
  const nextId = idCounter();
  return (content, { previous, live }) => {
    const key = `${live}:${JSON.stringify(content)}`;
    const last = previous === null ? undefined : drawn.get(previous);
    if (previous !== null && last?.key === key) {
      return previous;
    }
    for (const surface of last?.surfaces ?? []) {
      surface.dispose();
    }
    const operations = isObject(content) ? content["a2ui_operations"] : undefined;
    if (!Array.isArray(operations)) {
      return null;
    }
    const set = applyOperations(structuredClone(operations), {
      catalogId: A2UI_CATALOG.catalogId,
      components: CATALOG_COMPONENTS,
      functions: BASIC_FUNCTIONS,
      live,
      nextId,
      onAction,
      onError: (error) => {
        if (live) {
          onError({ version: "1.0", error });
        }
      },
    });
    const node = document.createElement("div");
    const style = document.createElement("style");
    style.textContent = A2UI_STYLES;
    node.append(style);
    const surfaces: Surface[] = [];
    for (const { surface, catalogId } of set.values()) {
      if (surface === null) {
        node.append(
          notice(`This surface uses the catalog ${catalogId}, which cannot be drawn here.`),
        );
      } else {
        surfaces.push(surface);
        node.append(surface.draw());
      }
    }
    drawn.set(node, { key, surfaces });
    return node;
  };
}
