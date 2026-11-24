import { describe, expect, it } from "vitest";
import { whenReady } from "../src/core/when_ready.js";

describe("whenReady", () => {
  it("hands a plain value on in the same tick, returning what the callback returns", () => {
    const seen: unknown[] = [];
    const result = whenReady({ a: "1" }, (value) => {
      seen.push(value);
      return "used";
    });
    expect(result).toBe("used");
    expect(seen).toEqual([{ a: "1" }]);
  });

  it("treats null, undefined and a then-less object as plain", () => {
    expect(whenReady(null, (value) => value)).toBeNull();
    expect(whenReady(undefined, (value) => value)).toBeUndefined();
    const thenless = JSON.parse('{"then":"no"}') as Record<string, string>;
    expect(whenReady(thenless, (value) => value)).toBe(thenless);
  });

  it("waits for a thenable, and rejects with its error", async () => {
    await expect(whenReady(Promise.resolve(2), (value) => value * 2)).resolves.toBe(4);
    const failure = new Error("no");
    let called = false;
    await expect(
      whenReady(Promise.reject(failure), () => {
        called = true;
      }),
    ).rejects.toBe(failure);
    expect(called).toBe(false);
  });
});
