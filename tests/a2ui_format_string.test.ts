// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the strings under test are formatString templates
import { describe, expect, it } from "vitest";
import { callBasic } from "./helpers/a2ui_function_context.js";

const data = {
  "/name": "Ada",
  "/n": 3,
  "/when": "2026-01-16",
  name: "rel",
  "/obj": { a: 1 },
  "/none": null,
};
const fs = (value: string): unknown => callBasic("formatString", { value }, data);

describe("formatString", () => {
  it("interpolates absolute and relative paths", () => {
    expect(fs("Hello ${/name}, ${name}!")).toBe("Hello Ada, rel!");
  });

  it("writes null, a missing path and a list or object plainly", () => {
    expect(fs("[${/none}][${/missing}]")).toBe("[][]");
    expect(fs("${/obj}")).toBe('{"a":1}');
    expect(fs("${/n}")).toBe("3");
  });

  it("keeps an escaped ${ literal, and plain text as is", () => {
    expect(fs("cost \\${/name}")).toBe("cost ${/name}");
    expect(fs("no expressions {here}")).toBe("no expressions {here}");
  });

  it("calls a function with named arguments, quoted, numeric, boolean and path values", () => {
    expect(fs("${formatDate(value:${/when}, format:'yyyy-MM-dd')}")).toBe("2026-01-16");
    expect(fs('${formatDate(value: "2026-02-03", format: "dd.MM.yy")}')).toBe("03.02.26");
    expect(fs("${formatNumber(value: 1234.5, decimals: 1, grouping: false)}")).toBe(
      new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        useGrouping: false,
      }).format(1234.5),
    );
    expect(fs("${not(value: true)} ${not(value: false)}")).toBe("false true");
    expect(fs("${required(value: null)}")).toBe('{"valid":false}');
    expect(fs("${formatNumber(value:/n)}")).toBe(new Intl.NumberFormat().format(3));
    expect(fs("${pluralize(value:${/n}, one:'a \\'x\\'', other:'many')}")).toBe("many");
  });

  it("calls a function with no arguments and nests calls", () => {
    expect(fs("${not()}")).toBe("true");
    expect(fs("${formatNumber(value: ${formatNumber(value: 2)})}")).toBe("2");
    expect(fs("${formatString(value:'${/name}')}")).toBe("Ada");
  });

  it("evaluates a braced string inside an expression", () => {
    expect(fs("${formatString(value: 'a}b')}")).toBe("a}b");
  });

  it("throws on malformed expressions", () => {
    expect(() => fs("${/name")).toThrow("unterminated ${");
    expect(() => fs("${'abc}")).toThrow("unterminated");
    expect(() => fs("${'abc' junk}")).toThrow("unexpected");
    expect(() => fs("${not(1)}")).toThrow("named arguments");
    expect(() => fs("${not(value true)}")).toThrow("colon");
    expect(() => fs("${nope(value: 1)}")).toThrow("no function nope");
    expect(() => callBasic("formatString", { value: 5 })).toThrow("value");
  });

  it("reads an empty expression as nothing", () => {
    expect(fs("[${}]")).toBe("[]");
  });

  it("skips whitespace around the path in an expression", () => {
    expect(fs("${ /name }")).toBe("Ada");
  });
});
