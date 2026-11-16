import type { A2uiFunction } from "../core/a2ui_function.js";
import { toBoolean } from "../core/to_boolean.js";
import { numberArg } from "./utils.js";

/** `formatNumber`: `value` through `Intl.NumberFormat`, with `decimals` and `grouping`. */
export const formatNumber: A2uiFunction = (args) => {
  const options: Intl.NumberFormatOptions = {
    useGrouping: args["grouping"] === undefined ? true : toBoolean(args["grouping"]),
  };
  if (args["decimals"] !== undefined) {
    const decimals = numberArg(args["decimals"], "decimals");
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }
  return new Intl.NumberFormat(undefined, options).format(numberArg(args["value"], "value"));
};
