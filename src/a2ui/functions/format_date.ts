import type { A2uiFunction } from "../core/a2ui_function.js";
import { stringArg } from "./utils.js";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Fields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function toDate(value: unknown): Date {
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : new Date(Number.NaN);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("value is not a date");
  }
  return date;
}

function fieldsOf(value: unknown): Fields {
  if (typeof value === "string") {
    const match = DATE_ONLY.exec(value);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: 0,
        minute: 0,
        second: 0,
      };
    }
  }
  const date = toDate(value);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  };
}

const pad = (value: number, width: number): string => String(value).padStart(width, "0");

/** The Unicode TR35 pattern's tokens: runs of a letter, quoted text, anything else as is. */
function render(pattern: string, fields: Fields): string {
  const wall = new Date(
    Date.UTC(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, fields.second),
  );
  const name = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(wall);
  const hour12 = fields.hour % 12 === 0 ? 12 : fields.hour % 12;
  let out = "";
  for (let i = 0; i < pattern.length; ) {
    const char = pattern.charAt(i);
    if (char === "'") {
      i++;
      if (pattern.charAt(i) === "'") {
        out += "'";
        i++;
        continue;
      }
      for (; i < pattern.length; i++) {
        if (pattern.charAt(i) !== "'") {
          out += pattern.charAt(i);
        } else if (pattern.charAt(i + 1) === "'") {
          out += "'";
          i++;
        } else {
          i++;
          break;
        }
      }
      continue;
    }
    let run = 1;
    while (pattern.charAt(i + run) === char) {
      run++;
    }
    i += run;
    switch (char) {
      case "y":
        out += run === 2 ? pad(fields.year % 100, 2) : pad(fields.year, run);
        break;
      case "M":
        out +=
          run <= 2
            ? pad(fields.month, run)
            : name({ month: run === 3 ? "short" : run === 4 ? "long" : "narrow" });
        break;
      case "d":
        out += pad(fields.day, run);
        break;
      case "E":
        out += name({ weekday: run <= 3 ? "short" : run === 4 ? "long" : "narrow" });
        break;
      case "h":
        out += pad(hour12, run);
        break;
      case "H":
        out += pad(fields.hour, run);
        break;
      case "m":
        out += pad(fields.minute, run);
        break;
      case "s":
        out += pad(fields.second, run);
        break;
      case "a":
        out += new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          hour12: true,
          timeZone: "UTC",
        })
          .formatToParts(wall)
          .filter((part) => part.type === "dayPeriod")
          .map((part) => part.value)
          .join("");
        break;
      default:
        out += char.repeat(run);
    }
  }
  return out;
}

/** `formatDate`: a date (ISO string, epoch milliseconds) by a Unicode TR35 `format`, names from `Intl` in the page's locale and time zone. */
export const formatDate: A2uiFunction = (args) =>
  render(stringArg(args["format"], "format"), fieldsOf(args["value"]));
