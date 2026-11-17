import type { McpAppsHost, McpAppsRoute } from "./types.js";

/**
 * The route a view's requests go through: a JSON POST of
 * {@link McpAppsRouteRequest} to `url` over `host.request`, so it carries the
 * element's headers (the CSRF token among them) and cookie policy.
 */
export function serverRoute(host: Pick<McpAppsHost, "request">, url: string): McpAppsRoute {
  return async (request) => {
    const response = await host.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`the mcp-apps route answered ${request.method} with ${response.status}`);
    }
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error(`the mcp-apps route answered ${request.method} with no result object`);
    }
    return body as Readonly<Record<string, unknown>>;
  };
}
