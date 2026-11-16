import type { A2uiFunction } from "../core/a2ui_function.js";
import { toBoolean } from "../core/to_boolean.js";
import { localeOf, numberArg, stringArg } from "./utils.js";

/** `formatCurrency`: `value` in the ISO 4217 `currency` through `Intl.NumberFormat`, with `decimals`, `grouping` and an optional `locale`. */
export const formatCurrency: A2uiFunction = (args) => {
  const options: Intl.NumberFormatOptions = {
    style: "currency",
    currency: stringArg(args["currency"], "currency"),
    useGrouping: args["grouping"] === undefined ? true : toBoolean(args["grouping"]),
  };
  if (args["decimals"] !== undefined) {
    const decimals = numberArg(args["decimals"], "decimals");
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }
  return new Intl.NumberFormat(localeOf(args), options).format(numberArg(args["value"], "value"));
};
