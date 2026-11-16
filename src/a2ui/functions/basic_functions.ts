import type { A2uiFunction } from "../core/a2ui_function.js";
import { and } from "./and.js";
import { email } from "./email.js";
import { formatCurrency } from "./format_currency.js";
import { formatDate } from "./format_date.js";
import { formatNumber } from "./format_number.js";
import { formatString } from "./format_string.js";
import { length } from "./length.js";
import { not } from "./not.js";
import { numeric } from "./numeric.js";
import { openUrl } from "./open_url.js";
import { or } from "./or.js";
import { pluralize } from "./pluralize.js";
import { regex } from "./regex.js";
import { required } from "./required.js";

/** The basic catalog's 14 functions, by name. */
export const BASIC_FUNCTIONS: Readonly<Record<string, A2uiFunction>> = {
  required,
  regex,
  length,
  numeric,
  email,
  formatString,
  formatNumber,
  formatCurrency,
  formatDate,
  pluralize,
  openUrl,
  and,
  or,
  not,
};
