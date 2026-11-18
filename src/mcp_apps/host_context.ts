import { MCP_APP_MAX_HEIGHT } from "../constants.js";
import type { McpAppHostContext, McpAppsHost } from "./types.js";

/**
 * The MCP Apps style variables a view is handed, each read from the private
 * alias the element draws that role with, so a host's own tokens reach it.
 */
const STYLE_VARIABLES: Readonly<Record<string, string>> = {
  "--color-background-primary": "--_bg",
  "--color-background-secondary": "--_wash",
  "--color-background-tertiary": "--_hover",
  "--color-background-inverse": "--_fg",
  "--color-text-primary": "--_fg",
  "--color-text-secondary": "--_ink-2",
  "--color-text-tertiary": "--_ink-3",
  "--color-text-inverse": "--_bg",
  "--color-text-danger": "--_danger",
  "--color-text-success": "--_success",
  "--color-border-primary": "--_border",
  "--color-border-secondary": "--_line",
  "--color-ring-primary": "--_ring",
  "--font-sans": "--_font",
  "--font-text-md-size": "--_font-size",
  "--border-radius-md": "--_radius",
};

/**
 * What a view is told about its host (MCP Apps 2026-01-26 `McpUiHostContext`):
 * the element's scheme, its tokens as style variables, its locale, and a frame
 * shown inline, as wide as `frame` and at most {@link MCP_APP_MAX_HEIGHT} tall.
 */
export function hostContext(host: McpAppsHost, frame: HTMLIFrameElement): McpAppHostContext {
  const tokens = host.tokenValues(Object.values(STYLE_VARIABLES));
  const variables: Record<string, string> = {};
  for (const [name, alias] of Object.entries(STYLE_VARIABLES)) {
    const value = tokens[alias];
    if (value !== undefined) {
      variables[name] = value;
    }
  }
  return {
    theme: host.colorScheme,
    styles: { variables },
    locale: host.locale,
    displayMode: "inline",
    availableDisplayModes: ["inline"],
    containerDimensions: { width: frame.clientWidth, maxHeight: MCP_APP_MAX_HEIGHT },
    platform: "web",
  };
}
