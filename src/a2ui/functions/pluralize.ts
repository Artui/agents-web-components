import type { A2uiFunction } from "../core/a2ui_function.js";
import { localeOf, numberArg, stringArg } from "./utils.js";

/** `pluralize`: the string for the CLDR plural category of `value`, an explicit `zero` for 0, else `other`. */
export const pluralize: A2uiFunction = (args) => {
  const count = numberArg(args["value"], "value");
  const other = stringArg(args["other"], "other");
  if (count === 0 && typeof args["zero"] === "string") {
    return args["zero"];
  }
  const category = new Intl.PluralRules(localeOf(args)).select(count);
  const text = args[category];
  return typeof text === "string" ? text : other;
};
