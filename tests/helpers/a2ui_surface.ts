import { CATALOG_COMPONENTS } from "../../src/a2ui/catalog_components.js";
import type { A2uiError } from "../../src/a2ui/core/a2ui_error.js";
import type { A2uiFunction } from "../../src/a2ui/core/a2ui_function.js";
import type { ComponentRenderer } from "../../src/a2ui/core/component_renderer.js";
import { DataModel } from "../../src/a2ui/core/data_model.js";
import { Surface } from "../../src/a2ui/core/surface.js";
import type { UserAction } from "../../src/a2ui/core/user_action.js";
import { BASIC_FUNCTIONS } from "../../src/a2ui/functions/basic_functions.js";

export const TEST_CATALOG_ID = "test:catalog";

export interface DrawOptions {
  readonly components: readonly unknown[];
  readonly data?: unknown;
  readonly renderers?: Readonly<Record<string, ComponentRenderer>>;
  readonly functions?: Readonly<Record<string, A2uiFunction>>;
  readonly live?: boolean;
}

export interface Drawn {
  readonly node: HTMLElement;
  readonly surface: Surface;
  readonly model: DataModel;
  readonly actions: UserAction[];
  readonly errors: A2uiError[];
  /** The drawn element of the component with this id. */
  byId(id: string): HTMLElement;
}

/**
 * Draw a surface through the real core, with the catalog's renderers and
 * functions unless the test names its own, attached to the document.
 */
export function drawSurface(options: DrawOptions): Drawn {
  const actions: UserAction[] = [];
  const errors: A2uiError[] = [];
  const model = new DataModel(structuredClone(options.data ?? {}));
  const surface = new Surface(
    {
      surfaceId: "s",
      catalogId: TEST_CATALOG_ID,
      components: options.renderers ?? CATALOG_COMPONENTS,
      functions: options.functions ?? BASIC_FUNCTIONS,
      live: options.live ?? true,
      onAction: (action) => actions.push(action),
      onError: (error) => errors.push(error),
    },
    model,
  );
  surface.define([...options.components]);
  const node = surface.draw();
  document.body.append(node);
  return {
    node,
    surface,
    model,
    actions,
    errors,
    byId: (id) => {
      const found = node.querySelector(`[data-a2ui-id="${id}"]`);
      if (!(found instanceof HTMLElement)) {
        throw new Error(`no component ${id} drawn`);
      }
      return found;
    },
  };
}
