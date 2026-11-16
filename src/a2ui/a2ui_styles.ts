import { CORE_STYLES } from "./core/core_styles.js";
import { DISPLAY_STYLES } from "./display/display_styles.js";
import { INPUT_STYLES } from "./inputs/input_styles.js";

/**
 * Every a2ui rule, in cascade order. Each surface node carries it in a
 * `<style>` of its own: this entry is loaded beside the element, not inside
 * it, so it cannot join the element's sheet, and `extraStyles` is the host's.
 */
export const A2UI_STYLES: string = [CORE_STYLES, DISPLAY_STYLES, INPUT_STYLES].join("\n");
