import { describe, expect, it } from "vitest";
import { viewCsp } from "../src/mcp_apps/view_csp.js";

function directives(policy: string): Record<string, string> {
  return Object.fromEntries(
    policy.split("; ").map((part) => {
      const [name = "", ...sources] = part.split(" ");
      return [name, sources.join(" ")];
    }),
  );
}

describe("viewCsp", () => {
  it.each([[undefined], [null], ["default-src *"], [{}]])(
    "is the specification's restrictive default when the view declares %j",
    (declared) => {
      expect(directives(viewCsp(declared).policy)).toEqual({
        "default-src": "'none'",
        "script-src": "'self' 'unsafe-inline'",
        "style-src": "'self' 'unsafe-inline'",
        "img-src": "'self' data:",
        "font-src": "'self' data:",
        "media-src": "'self' data:",
        "connect-src": "'none'",
        "frame-src": "'none'",
        "base-uri": "'self'",
        "object-src": "'none'",
      });
    },
  );

  it("adds each declared list to the directives it governs", () => {
    const csp = viewCsp({
      connectDomains: ["https://api.example"],
      resourceDomains: ["https://cdn.example"],
      frameDomains: ["https://maps.example"],
      baseUriDomains: ["https://base.example"],
    });

    expect(directives(csp.policy)).toMatchObject({
      "script-src": "'self' 'unsafe-inline' https://cdn.example",
      "style-src": "'self' 'unsafe-inline' https://cdn.example",
      "img-src": "'self' data: https://cdn.example",
      "font-src": "'self' data: https://cdn.example",
      "media-src": "'self' data: https://cdn.example",
      "connect-src": "https://api.example",
      "frame-src": "https://maps.example",
      "base-uri": "https://base.example",
      "object-src": "'none'",
    });
  });

  it.each([
    ["whitespace", "https://a.example https://evil.example"],
    ["a tab", "https://a.example\thttps://evil.example"],
    ["a semicolon", "https://a.example; script-src *"],
    ["a quote", "'unsafe-eval'"],
    ["a double quote", 'https://a.example"'],
    ["a comma", "https://a.example,https://evil.example"],
    ["nothing", ""],
  ])("drops a domain holding %s and keeps the rest", (_name, unsafe) => {
    const csp = viewCsp({ connectDomains: ["https://ok.example", unsafe, 7] });

    expect(csp.domains.connectDomains).toEqual(["https://ok.example"]);
    expect(directives(csp.policy)["connect-src"]).toBe("https://ok.example");
  });

  it("ignores a list that is not an array", () => {
    expect(viewCsp({ resourceDomains: "https://cdn.example" }).domains.resourceDomains).toEqual([]);
  });
});
