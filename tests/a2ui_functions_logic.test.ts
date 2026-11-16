import { describe, expect, it, vi } from "vitest";
import { callBasic } from "./helpers/a2ui_function_context.js";

describe("and, or, not", () => {
  it("and is true only when every value is", () => {
    expect(callBasic("and", { values: [true, "true", 1] })).toBe(true);
    expect(callBasic("and", { values: [true, { valid: false }] })).toBe(false);
  });

  it("or is true when any value is", () => {
    expect(callBasic("or", { values: [false, "nope", { valid: true }] })).toBe(true);
    expect(callBasic("or", { values: [false, 0, null] })).toBe(false);
  });

  it("not negates the coerced value", () => {
    expect(callBasic("not", { value: false })).toBe(true);
    expect(callBasic("not", { value: "TRUE" })).toBe(false);
    expect(callBasic("not", { value: { valid: false } })).toBe(true);
  });

  it("and and or throw without a list", () => {
    expect(() => callBasic("and", { values: true })).toThrow("list");
    expect(() => callBasic("or", {})).toThrow("list");
  });
});

describe("openUrl", () => {
  it("opens an approved URL from a user gesture, detached from this page", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(callBasic("openUrl", { url: "https://example.com/a" }, {}, true)).toBeUndefined();
    expect(open).toHaveBeenCalledWith("https://example.com/a", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("refuses outside a user gesture", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(() => callBasic("openUrl", { url: "https://example.com/a" })).toThrow("user gesture");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "", 5, null])(
    "refuses %j even from a gesture",
    (url) => {
      const open = vi.spyOn(window, "open").mockReturnValue(null);
      expect(() => callBasic("openUrl", { url }, {}, true)).toThrow("refused");
      expect(open).not.toHaveBeenCalled();
      open.mockRestore();
    },
  );
});
