import { describe, expect, it } from "vitest";
import { joinPointer } from "../src/a2ui/core/join_pointer.js";
import { toBoolean } from "../src/a2ui/core/to_boolean.js";
import { toValidationResult } from "../src/a2ui/core/to_validation_result.js";

describe("toBoolean", () => {
  it.each([
    [true, true],
    [false, false],
    [{ valid: true }, true],
    [{ valid: false, message: "x" }, false],
    ["TRUE", true],
    ["false", false],
    ["", false],
    ["hello", false],
    [0, false],
    [2, true],
    [null, false],
    [undefined, false],
    [{ valid: "yes" }, false],
    [[true], false],
  ])("coerces %j to %s", (value, expected) => {
    expect(toBoolean(value)).toBe(expected);
  });
});

describe("toValidationResult", () => {
  it("passes a truthy condition", () => {
    expect(toValidationResult(true, "m")).toEqual({ valid: true });
    expect(toValidationResult({ valid: true, message: "ignored" })).toEqual({ valid: true });
  });

  it("fails false with the rule's message and an error severity", () => {
    expect(toValidationResult(false, "Required")).toEqual({
      valid: false,
      severity: "error",
      message: "Required",
    });
    expect(toValidationResult(null)).toEqual({ valid: false, severity: "error" });
  });

  it("keeps a result's own message, code and severity, the rule's as fallback", () => {
    expect(
      toValidationResult({ valid: false, code: "X", message: "own", severity: "warning" }, "rule"),
    ).toEqual({ valid: false, code: "X", message: "own", severity: "warning" });
    expect(toValidationResult({ valid: false }, "rule")).toEqual({
      valid: false,
      severity: "error",
      message: "rule",
    });
  });
});

describe("joinPointer", () => {
  it("keeps an absolute path and resolves a relative one against the base", () => {
    expect(joinPointer("/items/2", "/company")).toBe("/company");
    expect(joinPointer("/items/2", "name")).toBe("/items/2/name");
    expect(joinPointer("", "name")).toBe("/name");
    expect(joinPointer("/items/2", "")).toBe("/items/2");
  });
});
