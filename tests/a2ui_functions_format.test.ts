import { describe, expect, it, vi } from "vitest";
import { callBasic } from "./helpers/a2ui_function_context.js";

const fmt = (name: string, args: Record<string, unknown>): unknown => callBasic(name, args);

const NUMBER = (value: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(undefined, options).format(value);

describe("formatNumber", () => {
  it("groups by default and honours decimals and grouping, in the page's locale", () => {
    expect(fmt("formatNumber", { value: 1234567.891 })).toBe(NUMBER(1234567.891));
    expect(fmt("formatNumber", { value: 1234.5, decimals: 2 })).toBe(
      NUMBER(1234.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    );
    expect(fmt("formatNumber", { value: 1234.5, decimals: 0 })).toBe(
      NUMBER(1234.5, { maximumFractionDigits: 0 }),
    );
    expect(fmt("formatNumber", { value: 1234, grouping: false })).toBe(
      NUMBER(1234, { useGrouping: false }),
    );
    expect(fmt("formatNumber", { value: 1234, grouping: "false" })).toBe(
      NUMBER(1234, { useGrouping: false }),
    );
    expect(fmt("formatNumber", { value: "12", grouping: true })).toBe(NUMBER(12));
  });

  it("does not take a locale argument", () => {
    expect(fmt("formatNumber", { value: 1234.5, locale: "de-DE" })).toBe(NUMBER(1234.5));
  });

  it.each([null, "abc", "", Number.NaN, Number.POSITIVE_INFINITY, {}])(
    "throws on value %j",
    (value) => {
      expect(() => fmt("formatNumber", { value })).toThrow("value must be a number");
    },
  );

  it("throws on a non-numeric decimals", () => {
    expect(() => fmt("formatNumber", { value: 1, decimals: "x" })).toThrow("decimals");
  });
});

describe("formatCurrency", () => {
  const money = (value: number, currency: string, extra?: Intl.NumberFormatOptions): string =>
    NUMBER(value, { style: "currency", currency, ...extra });

  it("formats in the currency, with its own digits by default", () => {
    expect(fmt("formatCurrency", { value: 1234.5, currency: "USD" })).toBe(money(1234.5, "USD"));
    expect(fmt("formatCurrency", { value: 1234, currency: "JPY" })).toBe(money(1234, "JPY"));
  });

  it("honours decimals and grouping", () => {
    expect(fmt("formatCurrency", { value: 1234.567, currency: "EUR", decimals: 0 })).toBe(
      money(1234.567, "EUR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    );
    expect(fmt("formatCurrency", { value: 1234, currency: "USD", grouping: false })).toBe(
      money(1234, "USD", { useGrouping: false }),
    );
  });

  it("throws without a string currency or a number", () => {
    expect(() => fmt("formatCurrency", { value: 1 })).toThrow("currency");
    expect(() => fmt("formatCurrency", { value: "x", currency: "USD" })).toThrow("value");
  });
});

describe("formatDate", () => {
  const when = new Date(2026, 0, 16, 14, 5, 9);
  const named = (options: Intl.DateTimeFormatOptions, date = when): string =>
    new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(
      new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours())),
    );
  const at = (format: string, date: Date = when): unknown =>
    fmt("formatDate", { value: date, format });
  const period = (date: Date): string =>
    new Intl.DateTimeFormat(undefined, { hour: "numeric", hour12: true, timeZone: "UTC" })
      .formatToParts(new Date(Date.UTC(2026, 0, 16, date.getHours())))
      .filter((part) => part.type === "dayPeriod")
      .map((part) => part.value)
      .join("");

  it("renders the catalog's numeric tokens in the page's time zone", () => {
    expect(at("HH:mm")).toBe("14:05");
    expect(at("yy-M-d H:m:s")).toBe("26-1-16 14:5:9");
    expect(at("MM/dd hh:ss")).toBe("01/16 02:09");
    expect(at("y")).toBe("2026");
    expect(at("yyyy-MM-dd")).toBe("2026-01-16");
  });

  it("names months, weekdays and the period through Intl", () => {
    expect(at("MMM")).toBe(named({ month: "short" }));
    expect(at("MMMM")).toBe(named({ month: "long" }));
    expect(at("MMMMM")).toBe(named({ month: "narrow" }));
    expect(at("E")).toBe(named({ weekday: "short" }));
    expect(at("EEEE")).toBe(named({ weekday: "long" }));
    expect(at("EEEEE")).toBe(named({ weekday: "narrow" }));
    expect(at("h:mm a")).toBe(`2:05 ${period(when)}`);
  });

  it("reads 12 as noon and midnight as 12", () => {
    const midnight = new Date(2026, 0, 16, 0, 30);
    const noon = new Date(2026, 0, 16, 12, 30);
    expect(at("h", midnight)).toBe("12");
    expect(at("h a", noon)).toBe(`12 ${period(noon)}`);
  });

  it("quotes literal text and passes other characters through", () => {
    expect(at("'Day' d 'of'")).toBe("Day 16 of");
    expect(at("d 'o''clock'")).toBe("16 o'clock");
    expect(at("d 'open")).toBe("16 open");
    expect(at("d ''")).toBe("16 '");
    expect(at("d, QQ")).toBe("16, QQ");
  });

  it("reads a date-only string as that calendar day wherever the host is", () => {
    expect(fmt("formatDate", { value: "2023-01-01", format: "yyyy-MM-dd HH" })).toBe(
      "2023-01-01 00",
    );
  });

  it("reads epoch milliseconds and a local-time string", () => {
    expect(fmt("formatDate", { value: when.getTime(), format: "HH:mm" })).toBe("14:05");
    expect(fmt("formatDate", { value: "2026-01-16T14:30:00", format: "HH:mm" })).toBe("14:30");
  });

  it("takes no locale or time zone argument", () => {
    expect(fmt("formatDate", { value: when, format: "HH:mm", timeZone: "Asia/Tokyo" })).toBe(
      "14:05",
    );
  });

  it("throws on what is not a date or a pattern", () => {
    expect(() => fmt("formatDate", { value: "nope", format: "d" })).toThrow("not a date");
    expect(() => fmt("formatDate", { value: null, format: "d" })).toThrow("not a date");
    expect(() => fmt("formatDate", { value: when, format: 4 })).toThrow("format");
  });
});

describe("pluralize", () => {
  const forms = {
    zero: "no items",
    one: "one item",
    two: "a pair",
    few: "few",
    many: "many",
    other: "items",
  };

  const category = (name: string) =>
    vi.spyOn(Intl, "PluralRules").mockImplementation(
      class {
        select = () => name;
      } as unknown as typeof Intl.PluralRules,
    );

  it("picks the category of the page's locale, falling back to other", () => {
    expect(fmt("pluralize", { value: 1, one: "item", other: "items" })).toBe(
      new Intl.PluralRules().select(1) === "one" ? "item" : "items",
    );
    expect(fmt("pluralize", { value: 5, one: "item", other: "items" })).toBe("items");
  });

  it.each(["two", "few", "many", "one"])("takes the %s string for that category", (name) => {
    const spy = category(name);
    expect(fmt("pluralize", { value: 7, ...forms })).toBe(forms[name as keyof typeof forms]);
    spy.mockRestore();
  });

  it("falls back to other when the category's string is missing", () => {
    const spy = category("many");
    expect(fmt("pluralize", { value: 7, one: "x", other: "items" })).toBe("items");
    spy.mockRestore();
  });

  it("uses zero for 0 when given, else the category", () => {
    expect(fmt("pluralize", { value: 0, ...forms })).toBe("no items");
    expect(fmt("pluralize", { value: 0, one: "item", other: "items" })).toBe(
      new Intl.PluralRules().select(0) === "one" ? "item" : "items",
    );
  });

  it("throws without a number or an other", () => {
    expect(() => fmt("pluralize", { value: "x", other: "o" })).toThrow("value");
    expect(() => fmt("pluralize", { value: 1 })).toThrow("other");
  });
});
