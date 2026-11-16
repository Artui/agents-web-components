import type { A2uiFunction } from "../core/a2ui_function.js";
import { toBoolean } from "../core/to_boolean.js";

/** `not`: the negation of `value` coerced to a boolean. */
export const not: A2uiFunction = (args) => !toBoolean(args["value"]);
