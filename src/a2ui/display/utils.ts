import type { A2uiComponent } from "../core/a2ui_component.js";
import type { SurfaceScope } from "../core/surface_scope.js";

/** The basic catalog's main-axis arrangements, for Row and Column. */
export const JUSTIFY: readonly string[] = [
  "start",
  "center",
  "end",
  "spaceBetween",
  "spaceAround",
  "spaceEvenly",
  "stretch",
];

/** The basic catalog's cross-axis alignments, for Row, Column and List. */
export const ALIGN: readonly string[] = ["start", "center", "end", "stretch"];

/** `value` when it is one of `allowed`, else `fallback`: how an enum property is read. */
export function choice(value: unknown, allowed: readonly string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

/** A `div` with `data` stated on it, filled with the component's `children` ChildList. */
export function childContainer(
  component: A2uiComponent,
  scope: SurfaceScope,
  data: Readonly<Record<string, string>>,
): HTMLElement {
  const element = document.createElement("div");
  for (const [key, value] of Object.entries(data)) {
    element.dataset[key] = value;
  }
  scope.children(component["children"], element);
  return element;
}
