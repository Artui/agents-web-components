import { describe, expect, it } from "vitest";
import { safeUrl } from "../src/a2ui/safe_url.js";

describe("safeUrl", () => {
  it("allows http and https by default and returns the absolute URL", () => {
    expect(safeUrl(" https://example.com/a b ")).toBe("https://example.com/a%20b");
    expect(safeUrl("\u0000\nhttp://example.com\u001f")).toBe("http://example.com/");
  });

  it("resolves a same-host relative path against the document", () => {
    expect(safeUrl("/img/a.png")).toBe(new URL("/img/a.png", document.baseURI).href);
    expect(safeUrl("a.png")).toBe(new URL("a.png", document.baseURI).href);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:x",
    "file:///etc/passwd",
    "blob:https://example.com/x",
    "https:example.com",
    "https:/example.com",
    "https:///path",
    "ht\ttps:example.com",
    "//evil.example/x",
    "\\\\evil.example/x",
    "/\\evil.example/x",
    "/\t/evil.example/x",
    `j${"\t".repeat(70)}avascript:alert(1)`,
    `/${"\t".repeat(70)}/evil.example/x`,
    `\n${"\r".repeat(100)}//evil.example/x`,
  ])("refuses %j", (url) => {
    expect(safeUrl(url)).toBeNull();
  });

  it("refuses a two-slash path naming the page's own host", () => {
    expect(safeUrl(`//${location.host}/x`)).toBeNull();
  });

  it("reads tab, CR and LF out of the scheme as a browser does", () => {
    expect(safeUrl("ht\ttps://example.com/")).toBe("https://example.com/");
  });

  it("refuses a non-string, an empty string and an unparseable URL", () => {
    expect(safeUrl(42)).toBeNull();
    expect(safeUrl(" \u0000 ")).toBeNull();
    expect(safeUrl("http://[")).toBeNull();
  });

  it("takes the schemes a caller allows", () => {
    expect(safeUrl("mailto:a@example.com", ["mailto:"])).toBe("mailto:a@example.com");
    expect(safeUrl("https://example.com", ["mailto:"])).toBeNull();
  });

  it("returns a data URL as given, trimmed, without parsing it", () => {
    const big = `data:image/png;base64,${"A".repeat(4_000_000)}`;
    expect(safeUrl(` ${big}\n`, ["data:"])).toBe(big);
  });
});
