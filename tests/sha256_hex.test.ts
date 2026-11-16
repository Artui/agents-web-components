import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/a2ui/sha256_hex.js";

describe("sha256Hex", () => {
  it.each([
    "",
    "abc",
    "é".repeat(100),
    "x".repeat(55),
    "x".repeat(56),
    "x".repeat(64),
    "3f2c1d1e-7a7b-4c4d-8e8f-909192939495",
  ])("matches node's digest of %j", (text) => {
    expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"));
  });
});
