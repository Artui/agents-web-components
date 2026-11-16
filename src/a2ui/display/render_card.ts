import type { ComponentRenderer } from "../core/component_renderer.js";

/** Card: one child on a raised, rounded panel. */
export const renderCard: ComponentRenderer = (component, scope) => {
  const element = document.createElement("div");
  element.append(scope.child(component["child"]));
  return element;
};
