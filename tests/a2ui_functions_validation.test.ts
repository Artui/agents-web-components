import { describe, expect, it } from "vitest";
import { callBasic } from "./helpers/a2ui_function_context.js";

const valid = (name: string, args: Record<string, unknown>): boolean =>
  (callBasic(name, args) as { valid: boolean }).valid;

describe("required", () => {
  it.each([
    ["x", true],
    [0, true],
    [false, true],
    [["a"], true],
    ["", false],
    [null, false],
    [undefined, false],
    [[], false],
  ])("value %j is valid: %s", (value, expected) => {
    expect(valid("required", { value })).toBe(expected);
  });
});

describe("regex", () => {
  it("searches the value for the pattern", () => {
    expect(valid("regex", { value: "xabcx", pattern: "abc" })).toBe(true);
    expect(valid("regex", { value: "xabcx", pattern: "^abc$" })).toBe(false);
    expect(valid("regex", { value: "ABC", pattern: "abc" })).toBe(false);
    expect(valid("regex", { value: 42, pattern: "^\\d+$" })).toBe(true);
  });

  it("is false for a missing value or a non-string pattern", () => {
    expect(valid("regex", { value: null, pattern: "a" })).toBe(false);
    expect(valid("regex", { value: undefined, pattern: "a" })).toBe(false);
    expect(valid("regex", { value: "a", pattern: 123 })).toBe(false);
  });

  it.each([
    ["an unbalanced pattern", "("],
    ["a backreference", "(a)\\1"],
    ["a named backreference", "(?<n>a)\\k<n>"],
    ["a named group", "(?<n>a)"],
    ["a lookbehind", "(?<=a)b"],
    ["a negative lookbehind", "(?<!a)b"],
    ["a property escape", "\\p{L}"],
    ["a negated property escape", "\\P{L}"],
    ["a pattern over 256 code points", "a".repeat(257)],
    ["nested plus quantifiers", "(a+)+$"],
    ["nested star quantifiers", "(a*)*b"],
    ["an open range inside a repeated group", "((a{2,})b)+"],
    ["a deeper nesting", "((a+)b)*"],
    ["a stray closing parenthesis", "a)"],
    ["an overlapping alternation repeated by a star", "(a|a)*b"],
    ["an overlapping alternation repeated by a plus", "(a|aa)+$"],
    ["a non-capturing alternation repeated by an open range", "(?:x|y){2,}"],
    ["an alternation one group down, repeated", "((a|a))*b"],
    ["an alternation two non-capturing groups down, repeated", "(?:(?:a|a))*b"],
    ["an alternation beside an optional, repeated", "(x?(a|a))*b"],
    ["an alternation before an optional, repeated", "((a|a)x?)*b"],
  ])("returns false and never throws for %s", (_name, pattern) => {
    const result = callBasic("regex", { value: "aaaa", pattern }) as {
      valid: boolean;
      code?: string;
    };
    expect(result).toEqual({ valid: false, code: "invalid_pattern" });
  });

  it("accepts what the dialect allows", () => {
    expect(valid("regex", { value: "b", pattern: "^(a|b)$" })).toBe(true);
    expect(valid("regex", { value: "cdab", pattern: "^(?:ab|cd){2}$" })).toBe(true);
    expect(valid("regex", { value: "a|b", pattern: "^[a|b]+$" })).toBe(true);
    expect(valid("regex", { value: "abbb", pattern: "^a|b+$" })).toBe(true);
    expect(valid("regex", { value: "a+", pattern: "^a\\+$" })).toBe(true);
    expect(valid("regex", { value: "a1", pattern: "^[a-z\\d]+$" })).toBe(true);
    expect(valid("regex", { value: "a]", pattern: "^[\\]a]+$" })).toBe(true);
    expect(valid("regex", { value: "aab", pattern: "^(a{2})b$" })).toBe(true);
    expect(valid("regex", { value: "ab", pattern: "^(?:a)(b)$" })).toBe(true);
    expect(valid("regex", { value: "ab", pattern: "^(a+)b$" })).toBe(true);
    expect(valid("regex", { value: "ab", pattern: "^((a)b)$" })).toBe(true);
    expect(valid("regex", { value: "a+", pattern: "^[+*]+|a\\+$" })).toBe(true);
  });

  it("treats the end anchors as the ends of the value only, and '.' as not a line break", () => {
    expect(valid("regex", { value: "a\nb", pattern: "^b$" })).toBe(false);
    expect(valid("regex", { value: "a\nb", pattern: "^a.b$" })).toBe(false);
  });
});

describe("length", () => {
  it("counts code points between min and max, inclusive", () => {
    expect(valid("length", { value: "abc", min: 3, max: 3 })).toBe(true);
    expect(valid("length", { value: "ab", min: 3 })).toBe(false);
    expect(valid("length", { value: "abcd", max: 3 })).toBe(false);
    expect(valid("length", { value: "ab", max: 3 })).toBe(true);
    expect(valid("length", { value: "😀😀", max: 2 })).toBe(true);
  });

  it("counts a list's items and a missing value as empty", () => {
    expect(valid("length", { value: ["a", "b"], min: 2 })).toBe(true);
    expect(valid("length", { value: null, min: 1 })).toBe(false);
    expect(valid("length", { value: undefined, max: 0 })).toBe(true);
    expect(valid("length", { value: 12345, max: 5 })).toBe(true);
  });

  it("throws without min or max", () => {
    expect(() => callBasic("length", { value: "a" })).toThrow("min or max");
  });
});

describe("numeric", () => {
  it("checks the range inclusively", () => {
    expect(valid("numeric", { value: 5, min: 5, max: 5 })).toBe(true);
    expect(valid("numeric", { value: 4, min: 5 })).toBe(false);
    expect(valid("numeric", { value: 6, max: 5 })).toBe(false);
    expect(valid("numeric", { value: 6, min: 1 })).toBe(true);
    expect(valid("numeric", { value: 1, max: 5 })).toBe(true);
  });

  it("reads a numeric string and refuses what is not a number", () => {
    expect(valid("numeric", { value: "7", min: 5 })).toBe(true);
    expect(valid("numeric", { value: "abc", min: 5 })).toBe(false);
    expect(valid("numeric", { value: "", min: 5 })).toBe(false);
    expect(valid("numeric", { value: null, min: 5 })).toBe(false);
    expect(valid("numeric", { value: Number.NaN, min: 5 })).toBe(false);
  });

  it("throws without min or max", () => {
    expect(() => callBasic("numeric", { value: 1 })).toThrow("min or max");
  });
});

describe("email", () => {
  it.each([
    ["a@b.co", true],
    ["first.last+tag@sub.example.com", true],
    ["a@b", false],
    ["a b@c.com", false],
    ["@c.com", false],
    ["a@-b.com", false],
    ["", false],
    [12, false],
    [null, false],
  ])("%j is valid: %s", (value, expected) => {
    expect(valid("email", { value })).toBe(expected);
  });
});
