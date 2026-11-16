import type { ComponentRenderer } from "../core/component_renderer.js";
import { ALIGN, childContainer, choice, JUSTIFY } from "./utils.js";

/** Row: its children side by side, `justify` along the row and `align` across it. */
export const renderRow: ComponentRenderer = (component, scope) =>
  childContainer(component, scope, {
    justify: choice(component["justify"], JUSTIFY, "start"),
    align: choice(component["align"], ALIGN, "stretch"),
  });
