import type { A2uiFunction } from "../core/a2ui_function.js";

/** `numeric`: the value is a number, or a numeric string, within `min` and `max` (inclusive). */
export const numeric: A2uiFunction = (args) => {
  const { value, min, max } = args;
  if (typeof min !== "number" && typeof max !== "number") {
    throw new TypeError("numeric needs min or max");
  }
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || Number.isNaN(number)) {
    return { valid: false };
  }
  return {
    valid: (typeof min !== "number" || number >= min) && (typeof max !== "number" || number <= max),
  };
};
