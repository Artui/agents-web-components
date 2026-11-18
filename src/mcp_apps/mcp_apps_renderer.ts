import type { ActivityRenderer } from "../core/activity_renderer.js";
import { renderMcpAppNotice } from "../ui/progress/mcp_app_notice.js";
import { readActivity } from "./read_activity.js";
import type { McpAppsServices, McpAppViewMount } from "./types.js";

/**
 * The `mcp-apps` renderer. Pure: it builds the view's node through `mount` and
 * touches no network, the node loading its own frame. A redraw of the same
 * message returns `context.previous` when it is a view this registration drew,
 * since moving an iframe reloads it, and passes the redraw's `live` to it. An
 * activity naming no server draws the notice; content that is not an
 * activity draws nothing (`null`).
 */
export function mcpAppsRenderer(
  mount: McpAppViewMount,
  services: McpAppsServices,
): ActivityRenderer {
  return (content, context) => {
    const kept = context.previous === null ? undefined : services.views.get(context.previous);
    if (kept !== undefined) {
      kept.live = context.live;
      return context.previous;
    }
    const activity = readActivity(content);
    if (activity === null) {
      return null;
    }
    const { serverId } = activity;
    if (serverId === undefined) {
      return renderMcpAppNotice(content, services.host.uiStrings.mcpAppUnsupported);
    }
    return mount(
      { messageId: context.messageId, activity: { ...activity, serverId }, live: context.live },
      services,
    );
  };
}
