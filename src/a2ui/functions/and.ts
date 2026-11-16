import type { A2uiFunction } from "../core/a2ui_function.js";
import { toBoolean } from "../core/to_boolean.js";

/** `and`: every one of `values`, each coerced to a boolean, is true. */
export const and: A2uiFunction = (args) => {
  const values = args["values"];
  if (!Array.isArray(values)) {
    throw new TypeError("values must be a list");
  }
  return values.every(toBoolean);
};
