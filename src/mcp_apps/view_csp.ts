/** The origins a view declared under `_meta.ui.csp`, each list cleaned of unsafe entries. */
export interface McpAppViewCspDomains {
  readonly connectDomains: readonly string[];
  readonly resourceDomains: readonly string[];
  readonly frameDomains: readonly string[];
  readonly baseUriDomains: readonly string[];
}

/** A view's CSP: the declared origins kept, and the policy built from them. */
export interface McpAppViewCsp {
  readonly domains: McpAppViewCspDomains;
  readonly policy: string;
}

/**
 * An entry that could add a source or a directive rather than name one origin:
 * whitespace starts another source, `;` another directive, a quote a keyword.
 */
const UNSAFE_DOMAIN = /[\s;'",]/;

function domains(declared: unknown, key: keyof McpAppViewCspDomains): readonly string[] {
  const list =
    typeof declared === "object" && declared !== null
      ? (declared as Readonly<Record<string, unknown>>)[key]
      : undefined;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter(
    (entry): entry is string =>
      typeof entry === "string" && entry !== "" && !UNSAFE_DOMAIN.test(entry),
  );
}

function directive(name: string, sources: readonly string[]): string {
  return [name, ...sources].join(" ");
}

/**
 * The CSP for a view, from the `csp` of its resource's `_meta.ui`.
 *
 * Undeclared, it is the restrictive default of the MCP Apps specification
 * (2026-01-26, apps.mdx "Host Behavior"), with the sandbox's own rules on top:
 * `object-src 'none'`, `frame-src` only to declared `frameDomains`, and
 * `base-uri` only to declared `baseUriDomains`. A declared domain holding
 * whitespace, `;`, a quote or a comma is dropped, so a server cannot widen the
 * policy by writing one into a domain. No `permissions` are granted.
 */
export function viewCsp(declared: unknown): McpAppViewCsp {
  const cleaned: McpAppViewCspDomains = {
    connectDomains: domains(declared, "connectDomains"),
    resourceDomains: domains(declared, "resourceDomains"),
    frameDomains: domains(declared, "frameDomains"),
    baseUriDomains: domains(declared, "baseUriDomains"),
  };
  const { connectDomains, resourceDomains, frameDomains, baseUriDomains } = cleaned;
  const policy = [
    "default-src 'none'",
    directive("script-src", ["'self'", "'unsafe-inline'", ...resourceDomains]),
    directive("style-src", ["'self'", "'unsafe-inline'", ...resourceDomains]),
    directive("img-src", ["'self'", "data:", ...resourceDomains]),
    directive("font-src", ["'self'", "data:", ...resourceDomains]),
    directive("media-src", ["'self'", "data:", ...resourceDomains]),
    directive("connect-src", connectDomains.length > 0 ? connectDomains : ["'none'"]),
    directive("frame-src", frameDomains.length > 0 ? frameDomains : ["'none'"]),
    directive("base-uri", baseUriDomains.length > 0 ? baseUriDomains : ["'self'"]),
    "object-src 'none'",
  ].join("; ");
  return { domains: cleaned, policy };
}

/**
 * `html` with `policy` as the first element of its `<head>`. Parsed rather than
 * spliced, so a script before `<head>`, or a `<head>` inside a comment, cannot
 * run ahead of the policy.
 */
export function withCspMeta(html: string, policy: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", policy);
  doc.head.prepend(meta);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}
