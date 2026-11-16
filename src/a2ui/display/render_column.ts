import type { ComponentRenderer } from "../core/component_renderer.js";
import { ALIGN, childContainer, choice, JUSTIFY } from "./utils.js";

/** Column: its children stacked, `justify` down the column and `align` across it. */
export const renderColumn: ComponentRenderer = (component, scope) =>
  childContainer(component, scope, {
    justify: choice(component["justify"], JUSTIFY, "start"),
    align: choice(component["align"], ALIGN, "stretch"),
  });
