import type { AgUiChat } from "../core/ag_ui_chat.js";

/**
 * The content of an `mcp-apps` activity, as pydantic-ai's AG-UI adapter and
 * the AG-UI MCP Apps middleware send it. It carries no HTML: the view's
 * resource is read through the host's route, from the server `serverId` names.
 */
export interface McpAppActivity {
  /** The `ui://` URI of the view's HTML resource. */
  readonly resourceUri: string;
  /** The arguments the model called the tool with. */
  readonly toolInput: Readonly<Record<string, unknown>>;
  /** The tool's MCP `CallToolResult` in wire format (`content`, `structuredContent`, `_meta`, `isError`). */
  readonly result: Readonly<Record<string, unknown>>;
  /** The toolset's `id`, present only when the host gave its toolset one; a view needs it. */
  readonly serverId?: string;
  /** The same value as `serverId` from pydantic-ai; a digest of the connection from the middleware. */
  readonly serverHash?: string;
}

/** An activity that names its server: the only kind a view is drawn for. */
export type McpAppViewActivity = McpAppActivity & { readonly serverId: string };

/** How `registerMcpApps` is set up. */
export interface McpAppsOptions {
  /** The host's `mcp-apps/` route, which answers {@link McpAppsRouteRequest}. */
  readonly url: string;
  /**
   * A sandbox proxy page on another origin, which hosts the view's frame as
   * the MCP Apps specification asks of a web host. Unset, the view is drawn in
   * an opaque-origin `srcdoc` frame, which a host page with a strict CSP blocks.
   */
  readonly sandboxProxyUrl?: string;
}

/** What `registerMcpApps` needs of the chat element: an `<ag-ui-chat>` has all of it. */
export type McpAppsHost = Pick<
  AgUiChat,
  | "registerActivityRenderer"
  | "request"
  | "sendMessage"
  | "uiStrings"
  | "colorScheme"
  | "locale"
  | "tokenValues"
  | "addEventListener"
  | "removeEventListener"
>;

/** The two MCP methods the route answers for a view. */
export type McpAppsRouteMethod = "tools/call" | "resources/read";

/** The JSON body POSTed to the route. */
export interface McpAppsRouteRequest {
  readonly serverId: string;
  readonly method: McpAppsRouteMethod;
  readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Sends one request to the route through `chat.request`, with the element's
 * headers and credentials. Resolves to the MCP result object; rejects when the
 * request fails or the route refuses it.
 */
export type McpAppsRoute = (
  request: McpAppsRouteRequest,
) => Promise<Readonly<Record<string, unknown>>>;

/** One view to draw: what the renderer hands {@link McpAppViewMount}. */
export interface McpAppView {
  /** The activity message's id, the same across every draw of one view. */
  readonly messageId: string;
  readonly activity: McpAppViewActivity;
  /**
   * `false` when the view is drawn from a stored conversation: it shows the
   * stored result, and its `tools/call`, `ui/message` and `ui/open-link` are
   * refused.
   */
  readonly live: boolean;
}

/** What a view's frame and bridge reach the page through. */
export interface McpAppsServices {
  readonly host: McpAppsHost;
  readonly route: McpAppsRoute;
  readonly sandboxProxyUrl: string | undefined;
  /**
   * The view nodes this registration drew. The renderer reuses only these on a
   * redraw, and passes the redraw's `live` through their state.
   */
  readonly views: WeakMap<Node, McpAppViewState>;
  /**
   * Each view resource read on this page, keyed by `JSON.stringify([serverId, uri])`.
   * A read that fails is dropped, so a later draw reads it again.
   */
  readonly resources: Map<string, Promise<McpAppResource>>;
}

/** What a drawn view's redraw can change. */
export interface McpAppViewState {
  /** Whether the view may act: see {@link McpAppView.live}. */
  live: boolean;
}

/** A view's HTML resource, as `resources/read` gave it. */
export interface McpAppResource {
  readonly html: string;
  /** `contents[0]._meta.ui.csp`, unchecked: the frame cleans it. */
  readonly csp: unknown;
}

/**
 * Builds the node one view lives in. It returns at once, with no network: the
 * node loads its frame itself, lazily, once it is in view, and tears it down
 * when it leaves the document. The renderer calls it once per message id and
 * returns the same node on every redraw, since moving an iframe reloads it.
 */
export type McpAppViewMount = (view: McpAppView, services: McpAppsServices) => HTMLElement;

/** How an MCP Apps view is shown: the MCP Apps `McpUiDisplayMode`. */
export type McpAppDisplayMode = "inline" | "fullscreen" | "pip";

/**
 * The context a view is told about its host in `ui/initialize`, the subset of
 * MCP Apps' `McpUiHostContext` this host fills, and patched in
 * `ui/notifications/host-context-changed`.
 */
export interface McpAppHostContext {
  readonly theme: "light" | "dark";
  readonly styles: { readonly variables: Readonly<Record<string, string>> };
  readonly locale: string;
  readonly displayMode: McpAppDisplayMode;
  readonly availableDisplayModes: readonly McpAppDisplayMode[];
  readonly containerDimensions: { readonly width: number; readonly maxHeight: number };
  readonly platform: "web";
}

/**
 * Answers a view's `ui/request-display-mode` with the mode it is shown in
 * after the request, which is the current one when the request is refused.
 */
export type McpAppDisplayModeRequest = (requested: unknown) => McpAppDisplayMode;
