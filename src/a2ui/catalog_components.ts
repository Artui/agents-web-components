import type { ComponentRenderer } from "./core/component_renderer.js";
import { DISPLAY_COMPONENTS } from "./display/display_components.js";
import { INPUT_COMPONENTS } from "./inputs/input_components.js";

/** Every component this renderer draws, by catalog name. */
export const CATALOG_COMPONENTS: Readonly<Record<string, ComponentRenderer>> = {
  ...DISPLAY_COMPONENTS,
  ...INPUT_COMPONENTS,
};
