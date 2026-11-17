import { fillUiString } from "../fill_ui_string.js";
import { renderRunNotice } from "./run_notice.js";

/**
 * The notice drawn in place of an MCP App view that cannot be shown: by the
 * element when no host registered `./mcp-apps`, and by `./mcp-apps` for an
 * activity that names no server. `template` fills `{uri}` with the resource.
 */
export function renderMcpAppNotice(content: unknown, template: string): HTMLDivElement {
  const uri = (content as { readonly resourceUri?: unknown } | null)?.resourceUri;
  return renderRunNotice(
    "\u{1F5BC}",
    fillUiString(template, { uri: typeof uri === "string" ? uri : "" }),
    "mcp-app",
  );
}
