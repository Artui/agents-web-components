import { MCP_APP_UNSUPPORTED_TEXT } from "../constants.js";
import type { ActivityRenderer } from "../core/activity_renderer.js";
import { renderMcpAppNotice } from "../ui/progress/mcp_app_notice.js";
import { readActivity } from "./read_activity.js";
import type { McpAppsServices, McpAppViewMount } from "./types.js";

/**
 * The `mcp-apps` renderer. Pure: it builds the view's node through `mount` and
 * touches no network, the node loading its own frame. A redraw of the same
 * message returns `context.previous`, since moving an iframe reloads it. An
 * activity naming no server draws the notice; content that is not an
 * activity draws nothing (`null`).
 */
export function mcpAppsRenderer(
  mount: McpAppViewMount,
  services: McpAppsServices,
): ActivityRenderer {
  return (content, context) => {
    if (context.previous !== null) {
      return context.previous;
    }
    const activity = readActivity(content);
    if (activity === null) {
      return null;
    }
    const { serverId } = activity;
    if (serverId === undefined) {
      const template = services.host.strings.mcpAppUnsupported ?? MCP_APP_UNSUPPORTED_TEXT;
      return renderMcpAppNotice(content, template);
    }
    return mount(
      { messageId: context.messageId, activity: { ...activity, serverId }, live: context.live },
      services,
    );
  };
}
