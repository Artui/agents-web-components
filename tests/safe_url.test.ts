import { describe, expect, it } from "vitest";
import { safeUrl } from "../src/a2ui/safe_url.js";

describe("safeUrl", () => {
  it("allows http and https by default and returns the absolute URL", () => {
    expect(safeUrl(" https://example.com/a b ")).toBe("https://example.com/a%20b");
    expect(safeUrl("http://example.com")).toBe("http://example.com/");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:x",
    "file:///etc/passwd",
  ])("refuses %s", (url) => {
    expect(safeUrl(url)).toBeNull();
  });

  it("refuses a non-string, an empty string and an unparseable URL", () => {
    expect(safeUrl(42)).toBeNull();
    expect(safeUrl("   ")).toBeNull();
    expect(safeUrl("http://[")).toBeNull();
  });

  it("takes the schemes a caller allows", () => {
    expect(safeUrl("mailto:a@example.com", ["mailto:"])).toBe("mailto:a@example.com");
    expect(safeUrl("https://example.com", ["mailto:"])).toBeNull();
  });
});
