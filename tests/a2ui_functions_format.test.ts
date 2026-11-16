import { describe, expect, it } from "vitest";
import { callBasic } from "./helpers/a2ui_function_context.js";

const fmt = (name: string, args: Record<string, unknown>): unknown => callBasic(name, args);

describe("formatNumber", () => {
  it("groups by default and honours decimals and grouping", () => {
    expect(fmt("formatNumber", { value: 1234567.891, locale: "en-US" })).toBe("1,234,567.891");
    expect(fmt("formatNumber", { value: 1234.5, decimals: 2, locale: "en-US" })).toBe("1,234.50");
    expect(fmt("formatNumber", { value: 1234.5, decimals: 0, locale: "en-US" })).toBe("1,235");
    expect(fmt("formatNumber", { value: 1234, grouping: false, locale: "en-US" })).toBe("1234");
    expect(fmt("formatNumber", { value: 1234, grouping: "false", locale: "en-US" })).toBe("1234");
  });

  it("honours an explicit locale", () => {
    expect(fmt("formatNumber", { value: 1234.5, decimals: 1, locale: "de-DE" })).toBe("1.234,5");
  });

  it("uses the host locale without one and reads a numeric string", () => {
    expect(fmt("formatNumber", { value: "12" })).toBe(new Intl.NumberFormat().format(12));
    expect(fmt("formatNumber", { value: 5, locale: null, decimals: 1, grouping: true })).toBe(
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(5),
    );
  });

  it.each([null, "abc", "", Number.NaN, Number.POSITIVE_INFINITY, {}])(
    "throws on value %j",
    (value) => {
      expect(() => fmt("formatNumber", { value })).toThrow("value must be a number");
    },
  );

  it("throws on a non-numeric decimals or a non-string locale", () => {
    expect(() => fmt("formatNumber", { value: 1, decimals: "x" })).toThrow("decimals");
    expect(() => fmt("formatNumber", { value: 1, locale: 5 })).toThrow("locale");
  });
});

describe("formatCurrency", () => {
  it("formats in the currency, with the locale's own digits by default", () => {
    expect(fmt("formatCurrency", { value: 1234.5, currency: "USD", locale: "en-US" })).toBe(
      "$1,234.50",
    );
    expect(fmt("formatCurrency", { value: 1234, currency: "JPY", locale: "ja-JP" })).toBe(
      "￥1,234",
    );
  });

  it("honours decimals, grouping and an explicit locale", () => {
    expect(
      fmt("formatCurrency", { value: 1234.567, currency: "EUR", decimals: 0, locale: "en-US" }),
    ).toBe("€1,235");
    expect(
      fmt("formatCurrency", { value: 1234, currency: "USD", grouping: false, locale: "en-US" }),
    ).toBe("$1234.00");
    expect(fmt("formatCurrency", { value: 1234.5, currency: "EUR", locale: "de-DE" })).toBe(
      "1.234,50\u00a0€",
    );
  });

  it("throws without a string currency or a number", () => {
    expect(() => fmt("formatCurrency", { value: 1 })).toThrow("currency");
    expect(() => fmt("formatCurrency", { value: "x", currency: "USD" })).toThrow("value");
  });
});

describe("formatDate", () => {
  const stamp = "2026-01-16T14:05:09Z";
  const utc = (format: string, extra: Record<string, unknown> = {}): unknown =>
    fmt("formatDate", { value: stamp, format, timeZone: "UTC", locale: "en-US", ...extra });

  it("renders the catalog's documented tokens", () => {
    expect(utc("MMM dd, yyyy")).toBe("Jan 16, 2026");
    expect(utc("HH:mm")).toBe("14:05");
    expect(utc("h:mm a")).toBe("2:05 PM");
    expect(utc("EEEE, d MMMM")).toBe("Friday, 16 January");
    expect(utc("yy-M-d H:m:s")).toBe("26-1-16 14:5:9");
    expect(utc("MM/dd hh:ss")).toBe("01/16 02:09");
    expect(utc("E MMMMM")).toBe("Fri J");
    expect(utc("EEEEE")).toBe("F");
    expect(utc("y")).toBe("2026");
  });

  it("reads 12 as noon and midnight as 12 AM", () => {
    expect(
      fmt("formatDate", { value: "2026-01-16T00:30:00Z", format: "h a", timeZone: "UTC" }),
    ).toBe("12 AM");
    expect(
      fmt("formatDate", { value: "2026-01-16T12:30:00Z", format: "h a", timeZone: "UTC" }),
    ).toBe("12 PM");
  });

  it("quotes literal text and passes other characters through", () => {
    expect(utc("'Day' d 'of' MMMM")).toBe("Day 16 of January");
    expect(utc("d 'o''clock'")).toBe("16 o'clock");
    expect(utc("d 'open")).toBe("16 open");
    expect(utc("d ''")).toBe("16 '");
    expect(utc("d, QQ")).toBe("16, QQ");
  });

  it("honours an explicit locale for names", () => {
    expect(utc("EEEE d MMMM", { locale: "fr-FR" })).toBe("vendredi 16 janvier");
  });

  it("converts to an explicit time zone", () => {
    expect(utc("HH:mm d", { timeZone: "Asia/Tokyo" })).toBe("23:05 16");
    expect(utc("HH:mm d", { timeZone: "America/Los_Angeles" })).toBe("06:05 16");
  });

  it("reads a date-only string as that calendar day wherever the host is", () => {
    expect(fmt("formatDate", { value: "2023-01-01", format: "MMM d", locale: "en-US" })).toBe(
      "Jan 1",
    );
  });

  it("reads epoch milliseconds, a Date and a local-time string in the host's zone", () => {
    const local = new Date(2026, 0, 16, 14, 30);
    expect(fmt("formatDate", { value: local.getTime(), format: "HH:mm" })).toBe("14:30");
    expect(fmt("formatDate", { value: local, format: "yyyy-MM-dd" })).toBe("2026-01-16");
    expect(fmt("formatDate", { value: "2026-01-16T14:30:00", format: "HH:mm" })).toBe("14:30");
  });

  it("throws on what is not a date or a pattern", () => {
    expect(() => fmt("formatDate", { value: "nope", format: "d" })).toThrow("not a date");
    expect(() => fmt("formatDate", { value: null, format: "d" })).toThrow("not a date");
    expect(() => fmt("formatDate", { value: stamp, format: 4 })).toThrow("format");
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

  it("picks the CLDR category, falling back to other", () => {
    expect(fmt("pluralize", { value: 1, one: "item", other: "items", locale: "en" })).toBe("item");
    expect(fmt("pluralize", { value: 5, one: "item", other: "items", locale: "en" })).toBe("items");
    expect(fmt("pluralize", { value: 2, ...forms, locale: "ar" })).toBe("a pair");
    expect(fmt("pluralize", { value: 3, ...forms, locale: "ru" })).toBe("few");
    expect(fmt("pluralize", { value: 5, ...forms, locale: "ru" })).toBe("many");
    expect(fmt("pluralize", { value: 5, one: "x", other: "items", locale: "ru" })).toBe("items");
  });

  it("uses zero for 0 when given, else the category", () => {
    expect(fmt("pluralize", { value: 0, ...forms, locale: "en" })).toBe("no items");
    expect(fmt("pluralize", { value: 0, one: "item", other: "items", locale: "en" })).toBe("items");
  });

  it("throws without a number or an other", () => {
    expect(() => fmt("pluralize", { value: "x", other: "o" })).toThrow("value");
    expect(() => fmt("pluralize", { value: 1 })).toThrow("other");
  });
});
