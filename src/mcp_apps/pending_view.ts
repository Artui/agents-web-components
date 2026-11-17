import { MCP_APP_UNSUPPORTED_TEXT } from "../constants.js";
import { renderMcpAppNotice } from "../ui/progress/mcp_app_notice.js";
import type { McpAppViewMount } from "./types.js";

/**
 * The mount `registerMcpApps` draws a view with until the sandboxed frame
 * exists: the notice, so a host that registers the entry early sees what it
 * saw before rather than an empty box.
 */
export const pendingView: McpAppViewMount = (view, services) =>
  renderMcpAppNotice(
    view.activity,
    services.host.strings.mcpAppUnsupported ?? MCP_APP_UNSUPPORTED_TEXT,
  );
