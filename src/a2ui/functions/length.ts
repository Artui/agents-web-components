import type { A2uiFunction } from "../core/a2ui_function.js";

function sizeOf(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return Array.isArray(value) ? value.length : [...String(value)].length;
}

/** `length`: the value's length, in code points, is within `min` and `max` (inclusive). */
export const length: A2uiFunction = (args) => {
  const { min, max } = args;
  if (typeof min !== "number" && typeof max !== "number") {
    throw new TypeError("length needs min or max");
  }
  const size = sizeOf(args["value"]);
  const valid =
    (typeof min !== "number" || size >= min) && (typeof max !== "number" || size <= max);
  return { valid };
};
