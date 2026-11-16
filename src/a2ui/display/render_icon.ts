import type { ComponentRenderer } from "../core/component_renderer.js";
import { ICON_GLYPHS } from "./icon_glyphs.js";

const SVG = "http://www.w3.org/2000/svg";
const SYMBOL_BOX = "0 -960 960 960";
const PATH_BOX = "0 0 24 24";

/**
 * Icon: a catalog name drawn from {@link ICON_GLYPHS}, or `{svgPath}` drawn in
 * a 24-unit box. An unknown name draws an empty glyph of the same size.
 */
export const renderIcon: ComponentRenderer = (component, scope) => {
  const element = document.createElement("span");
  const svg = document.createElementNS(SVG, "svg");
  const path = document.createElementNS(SVG, "path");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.append(path);
  element.append(svg);
  if (component["@accessibility"] === undefined) {
    element.setAttribute("aria-hidden", "true");
  } else {
    element.setAttribute("role", "img");
  }
  scope.watch(component["name"], (value) => {
    const [box, d] = glyphOf(value);
    svg.setAttribute("viewBox", box);
    element.toggleAttribute("data-unknown", d === null);
    if (d === null) {
      path.removeAttribute("d");
    } else {
      path.setAttribute("d", d);
    }
  });
  return element;
};

function glyphOf(value: unknown): readonly [string, string | null] {
  if (typeof value === "string") {
    const name = value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return [SYMBOL_BOX, Object.hasOwn(ICON_GLYPHS, name) ? (ICON_GLYPHS[name] as string) : null];
  }
  const svgPath =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)["svgPath"]
      : null;
  return [PATH_BOX, typeof svgPath === "string" ? svgPath : null];
}
