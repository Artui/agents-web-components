import type { A2uiFunction } from "../core/a2ui_function.js";

/** `required`: the value is neither null, undefined, an empty string nor an empty list. */
export const required: A2uiFunction = (args) => {
  const value = args["value"];
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);
  return { valid: !empty };
};
