import { PYDANTIC_AI_ACTIVITY_TYPE } from "./constants.js";
import { hostBridge } from "./mcp_apps/host_bridge.js";
import { mcpAppsRenderer } from "./mcp_apps/mcp_apps_renderer.js";
import { serverRoute } from "./mcp_apps/server_route.js";
import type { McpAppsHost, McpAppsOptions } from "./mcp_apps/types.js";
import { viewFrame } from "./mcp_apps/view_frame.js";

export type {
  McpAppActivity,
  McpAppsHost,
  McpAppsOptions,
  McpAppsRouteMethod,
  McpAppsRouteRequest,
} from "./mcp_apps/types.js";

/**
 * Draw MCP Apps views in `chat`, replacing the element's built-in notice.
 *
 * Registers the `mcp-apps` activity renderer. A view's resource and its tool
 * calls go to `options.url`, the host's `mcp-apps/` route, through
 * `chat.request`, so they carry the element's headers and cookie policy. An
 * activity naming no server still draws the notice: give the toolset an `id`.
 *
 * A view is framed through `options.sandboxProxyUrl` when it is set, and in a
 * `srcdoc` frame otherwise, which a host page with a strict `script-src`
 * blocks. Throws when the proxy is on the page's own origin, where its
 * `allow-same-origin` would leave the view unsandboxed.
 */
export function registerMcpApps(chat: McpAppsHost, options: McpAppsOptions): void {
  const { sandboxProxyUrl } = options;
  if (
    sandboxProxyUrl !== undefined &&
    new URL(sandboxProxyUrl, document.baseURI).origin === window.location.origin
  ) {
    throw new Error(
      `registerMcpApps: sandboxProxyUrl ${sandboxProxyUrl} must be on another origin than the page`,
    );
  }
  const services = {
    host: chat,
    route: serverRoute(chat, options.url),
    sandboxProxyUrl,
    views: new WeakMap(),
    resources: new Map(),
  };
  chat.registerActivityRenderer({
    type: PYDANTIC_AI_ACTIVITY_TYPE.MCP_APPS,
    render: mcpAppsRenderer(
      // Inline is the only mode this host shows a view in, so a request for
      // another is answered with it.
      viewFrame(hostBridge(() => "inline")),
      services,
    ),
  });
}
