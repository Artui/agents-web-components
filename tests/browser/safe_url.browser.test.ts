import { describe, expect, it } from "vitest";
import { safeUrl } from "../../src/a2ui/safe_url.js";

// A real browser's URL parser, the one an agent's URL would meet.
describe("safeUrl in a browser", () => {
  it.each([
    "javascript:alert(1)",
    "java\tscript:alert(1)",
    `j${"\t".repeat(70)}avascript:alert(1)`,
    "//evil.example/x",
    "\\\\evil.example/x",
    "/\\evil.example/x",
    `/${"\t".repeat(70)}/evil.example/x`,
    "https:evil.example",
    "blob:https://example.com/x",
  ])("refuses %j", (url) => {
    expect(safeUrl(url, ["https:", "http:", "data:"])).toBeNull();
  });

  it("refuses a two-slash path naming the page's own host", () => {
    expect(location.host).not.toBe("");
    expect(safeUrl(`//${location.host}/x`)).toBeNull();
  });

  it("keeps a same-host path on the page's host", () => {
    expect(safeUrl("/img/a.png")).toBe(new URL("/img/a.png", document.baseURI).href);
  });
});
