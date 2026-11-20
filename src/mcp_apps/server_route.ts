import { MCP_APPS_ROUTE_ERROR } from "../constants.js";
import type { McpAppsHost, McpAppsRoute } from "./types.js";

type Body = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Body {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The route's own refusal, carrying its JSON-RPC `code` for the bridge to forward. */
function refusal(error: Body): Error | null {
  const { code, message } = error;
  if (!Number.isInteger(code) || typeof message !== "string") {
    return null;
  }
  return Object.assign(new Error(message), { name: MCP_APPS_ROUTE_ERROR, code });
}

/**
 * The route a view's requests go through: a JSON POST of
 * {@link McpAppsRouteRequest} to `url` over `host.request`, so it carries the
 * element's headers (the CSRF token among them) and cookie policy. The route
 * answers `{ result }`, which this resolves to, or `{ error: { code, message } }`,
 * which it rejects with as an error named {@link MCP_APPS_ROUTE_ERROR}. A non-2xx
 * answer (401, 403, 429) is read the same way; one that is not that envelope rejects
 * with the status and no code.
 */
export function serverRoute(host: Pick<McpAppsHost, "request">, url: string): McpAppsRoute {
  return async (request) => {
    const response = await host.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const refused = isRecord(body) && isRecord(body["error"]) ? refusal(body["error"]) : null;
      if (refused !== null) {
        throw refused;
      }
      throw new Error(`the mcp-apps route answered ${request.method} with ${response.status}`);
    }
    const body: unknown = await response.json();
    if (isRecord(body) && isRecord(body["result"])) {
      return body["result"];
    }
    const refused = isRecord(body) && isRecord(body["error"]) ? refusal(body["error"]) : null;
    if (refused !== null) {
      throw refused;
    }
    throw new Error(`the mcp-apps route answered ${request.method} with no result object`);
  };
}
