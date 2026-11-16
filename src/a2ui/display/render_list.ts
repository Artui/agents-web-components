import type { ComponentRenderer } from "../core/component_renderer.js";
import { ALIGN, childContainer, choice } from "./utils.js";

/**
 * List: its children in a scrolling run, vertical or horizontal. A template
 * ChildList draws once per item, each reading its item through relative paths.
 */
export const renderList: ComponentRenderer = (component, scope) =>
  childContainer(component, scope, {
    direction: choice(component["direction"], ["vertical", "horizontal"], "vertical"),
    align: choice(component["align"], ALIGN, "stretch"),
  });
