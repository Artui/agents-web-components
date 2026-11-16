import { describe, expect, it } from "vitest";
import { pythonJson } from "../src/a2ui/python_json.js";

describe("pythonJson", () => {
  it("writes nested values compactly, keys in insertion order", () => {
    const value = { b: [1, "two", { c: null, d: true }], a: { z: 0.5, y: -3 }, e: "é — “q”\n" };
    expect(pythonJson(value)).toBe(JSON.stringify(value));
    expect(pythonJson(value)).toBe(
      '{"b":[1,"two",{"c":null,"d":true}],"a":{"z":0.5,"y":-3},"e":"é — “q”\\n"}',
    );
  });

  it("spells a tiny non-integer the way Python does, with a two digit exponent", () => {
    expect(pythonJson(0.00001)).toBe("1e-05");
    expect(pythonJson(1.5e-7)).toBe("1.5e-07");
    expect(pythonJson(-0.00001)).toBe("-1e-05");
    expect(pythonJson(-2.5e-10)).toBe("-2.5e-10");
    expect(pythonJson({ tiny: [1e-9, 0.00009] })).toBe('{"tiny":[1e-09,9e-05]}');
  });

  it("leaves 0.0001 and every other number as JSON.stringify writes it", () => {
    for (const number of [0.0001, -0.0001, 0.5, 0, 42, -7, 1e21, 123456789012345680000, 2 ** 53]) {
      expect(pythonJson(number)).toBe(JSON.stringify(number));
    }
    expect(pythonJson(1e21)).toBe("1e+21");
    expect(pythonJson(Number.NaN)).toBe("null");
    expect(pythonJson(Number.POSITIVE_INFINITY)).toBe("null");
  });

  it("skips an undefined member as JSON.stringify does, and writes one in an array as null", () => {
    expect(pythonJson({ a: 1, b: undefined, c: 2 })).toBe('{"a":1,"c":2}');
    expect(pythonJson([1, undefined])).toBe("[1,null]");
    expect(pythonJson(undefined)).toBe("null");
  });
});
