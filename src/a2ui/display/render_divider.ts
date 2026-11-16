import type { ComponentRenderer } from "../core/component_renderer.js";
import { choice } from "./utils.js";

/** Divider: a one-pixel rule along `axis`, a separator to assistive technology. */
export const renderDivider: ComponentRenderer = (component) => {
  const element = document.createElement("hr");
  const axis = choice(component["axis"], ["horizontal", "vertical"], "horizontal");
  element.dataset["axis"] = axis;
  element.setAttribute("aria-orientation", axis);
  return element;
};
