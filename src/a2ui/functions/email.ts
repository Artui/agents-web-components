import type { A2uiFunction } from "../core/a2ui_function.js";

const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** `email`: the value is an address with a dotted domain, by the HTML living standard's grammar. */
export const email: A2uiFunction = (args) => {
  const value = args["value"];
  return { valid: typeof value === "string" && EMAIL.test(value) };
};
