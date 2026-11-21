import { renderMcpAppNotice } from "../ui/progress/mcp_app_notice.js";
import { displayMode, type McpAppViewDisplay } from "./display_mode.js";
import { sandboxProxy } from "./sandbox_proxy.js";
import type {
  McpAppResource,
  McpAppsServices,
  McpAppView,
  McpAppViewActivity,
  McpAppViewMount,
  McpAppViewState,
} from "./types.js";
import { type McpAppViewConsent, viewConsent } from "./view_consent.js";
import { viewCsp, withCspMeta } from "./view_csp.js";

/** What the host bridge drives one view's document through. */
export interface McpAppViewChannel {
  readonly iframe: HTMLIFrameElement;
  /**
   * The window the view's messages arrive from now: match `event.source`
   * against it. Through a proxy it is the proxy's window, whose own
   * `ui/notifications/sandbox-` messages the frame answers. A move of the
   * frame in the page reloads it in a new window, whose view initialises again.
   */
  readonly source: Window | null;
  /** The origin those messages carry: `"null"` for a `srcdoc` frame, the proxy's otherwise. */
  readonly origin: string;
  /** Posts a message to the view, through the proxy when there is one. */
  post(message: unknown): void;
  /** Whether the view may act now: a redraw of its message can change it. */
  readonly live: boolean;
  /** Tears the view down, drawing the notice in its place. */
  close(): void;
  /** How the view is shown, inline or fullscreen, and what switches it. */
  readonly display: McpAppViewDisplay;
  /** Asks the user, beside the frame, whether the view may send a message or run a tool. */
  readonly consent: McpAppViewConsent;
}

/**
 * Starts the host's end of a view's bridge once its frame is in the document,
 * before the view's document runs. Returns what stops it, called once when the
 * view is torn down or leaves the document.
 */
export type McpAppViewConnect = (
  channel: McpAppViewChannel,
  view: McpAppView,
  services: McpAppsServices,
) => () => void;

const FRAME_HEIGHT = "320px";

function noop(): void {}

function showNotice(node: HTMLElement, view: McpAppView, services: McpAppsServices): void {
  node.replaceChildren(
    renderMcpAppNotice(view.activity, services.host.uiStrings.mcpAppUnsupported),
  );
}

function decodeBase64(blob: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(blob), (char) => char.charCodeAt(0)));
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)[key]
    : undefined;
}

function toResource(result: Readonly<Record<string, unknown>>): McpAppResource {
  const contents = result["contents"];
  const first: unknown = Array.isArray(contents) ? contents[0] : undefined;
  const text = field(first, "text");
  const blob = field(first, "blob");
  if (typeof text === "string") {
    return { html: text, csp: field(field(field(first, "_meta"), "ui"), "csp") };
  }
  if (typeof blob === "string") {
    return { html: decodeBase64(blob), csp: field(field(field(first, "_meta"), "ui"), "csp") };
  }
  throw new Error("its resources/read result has no text or blob content");
}

/** The view's resource, read once per page and kept unless the read fails. */
function readResource(
  services: McpAppsServices,
  activity: McpAppViewActivity,
): Promise<McpAppResource> {
  const key = JSON.stringify([activity.serverId, activity.resourceUri]);
  const cached = services.resources.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const read = services
    .route({
      serverId: activity.serverId,
      method: "resources/read",
      params: { uri: activity.resourceUri },
    })
    .then(toResource);
  services.resources.set(key, read);
  read.catch(() => services.resources.delete(key));
  return read;
}

/** What one visit of a view's node is told by the node: see {@link openView}. */
interface Visit {
  /** Whether the node is still on the visit that opened the view. */
  readonly current: () => boolean;
  /** Stops watching for the node's removal: no frame was opened. */
  readonly unwatch: () => void;
  /** Stops watching the node for good: the view was closed to the notice. */
  readonly end: () => void;
}

/** Puts the view's frame in `node`; resolves to what tears it down. */
async function openView(
  node: HTMLElement,
  view: McpAppView,
  services: McpAppsServices,
  state: McpAppViewState,
  connect: McpAppViewConnect,
  visit: Visit,
): Promise<(notice: boolean) => void> {
  const { current } = visit;
  const uri = view.activity.resourceUri;
  let resource: McpAppResource;
  try {
    resource = await readResource(services, view.activity);
  } catch (error) {
    console.warn(`ag-ui-chat: the MCP App view ${uri} could not be read`, error);
    showNotice(node, view, services);
    visit.unwatch();
    return noop;
  }
  if (!current()) {
    return noop;
  }
  const csp = viewCsp(resource.csp);
  const iframe = document.createElement("iframe");
  iframe.className = "mcp-app-view-frame";
  iframe.title = uri;
  Object.assign(iframe.style, {
    display: "block",
    width: "100%",
    height: FRAME_HEIGHT,
    border: "0",
  });
  // The frame's box, which fullscreen fixes over the page: restyled, never moved.
  const stage = document.createElement("div");
  stage.className = "mcp-app-view-stage";
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "mcp-app-view-exit";
  exit.textContent = services.host.uiStrings.mcpAppExitFullscreen;
  exit.hidden = true;
  stage.append(exit, iframe);
  const display = displayMode(node, stage, exit, services.overlay);
  const consent = viewConsent(stage, () => services.host.uiStrings);
  const proxyUrl = services.sandboxProxyUrl;
  let post: (message: unknown) => void;
  let origin = "null";
  let dispose: () => void = noop;
  let closed = false;
  let disconnect: () => void = noop;
  const close = (notice: boolean): void => {
    if (closed) {
      return;
    }
    closed = true;
    disconnect();
    consent.dispose();
    dispose();
    display.dispose();
    stage.remove();
    if (notice) {
      showNotice(node, view, services);
      visit.end();
    }
  };
  const navigated = (): void => {
    console.warn(`ag-ui-chat: the MCP App view ${uri} navigated its frame and was closed`);
    close(true);
  };
  if (proxyUrl === undefined) {
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.srcdoc = withCspMeta(resource.html, csp.policy);
    post = (message) => iframe.contentWindow?.postMessage(message, "*");
  } else {
    const proxy = sandboxProxy(iframe, proxyUrl, resource.html, csp.domains, navigated);
    post = proxy.post;
    origin = proxy.origin;
    dispose = proxy.dispose;
  }
  // The src is set before the frame is placed, so each window loads once. A
  // second load in one window is the view navigating its frame, which a CSP
  // cannot forbid; a load in a new window is the frame moved in the page.
  // Through a proxy the view's own frame is inside the proxy, which reports it.
  let loaded: Window | null = null;
  iframe.addEventListener("load", () => {
    if (loaded !== iframe.contentWindow) {
      loaded = iframe.contentWindow;
      return;
    }
    navigated();
  });
  node.replaceChildren(stage);
  disconnect = connect(
    {
      iframe,
      get source() {
        return iframe.contentWindow;
      },
      origin,
      post,
      get live() {
        return state.live;
      },
      close: () => close(true),
      display,
      consent,
    },
    view,
    services,
  );
  return close;
}

/**
 * The mount `registerMcpApps` draws views with: a node that reads the view's
 * resource and puts its sandboxed frame in itself once it first scrolls into
 * view, and takes the frame down when it leaves the document, in or out of
 * sight. A view that navigates its own frame, or asks to be torn down, is
 * closed to the notice and not framed again.
 *
 * Without a sandbox proxy the frame is `srcdoc` with `sandbox="allow-scripts"`
 * (an opaque origin) and the view's CSP as the first `<meta>` of its `<head>`.
 * A `srcdoc` document also inherits the host page's CSP, so under a strict
 * `script-src` the view's inline scripts are blocked: such a host configures a
 * proxy. With one, the frame is the proxy, loaded by {@link sandboxProxy}.
 */
export function viewFrame(connect: McpAppViewConnect): McpAppViewMount {
  return (view, services) => {
    const node = document.createElement("div");
    node.className = "mcp-app-view";
    const state: McpAppViewState = { live: view.live };
    services.views.set(node, state);
    // Each time the node leaves the document its frame goes, and the next
    // time it is in view it is framed again, from the cached resource.
    let opening: Promise<(notice: boolean) => void> | null = null;
    let visits = 0;
    const leave = (): void => {
      removal.disconnect();
      visits += 1;
      const leaving = opening;
      opening = null;
      void leaving?.then((close) => close(false));
    };
    // A removal out of sight, or under display:none, changes no intersection,
    // so it is watched for in every root the node is in, up to the document.
    const removal = new MutationObserver(() => (node.isConnected ? watch() : leave()));
    const watch = (): void => {
      removal.disconnect();
      let root = node.getRootNode();
      removal.observe(root, { childList: true, subtree: true });
      while (root instanceof ShadowRoot) {
        root = root.host.getRootNode();
        removal.observe(root, { childList: true, subtree: true });
      }
    };
    const sight = new IntersectionObserver((entries) => {
      if (!node.isConnected) {
        leave();
        return;
      }
      if (opening === null && entries.some((entry) => entry.isIntersecting)) {
        const visit = visits;
        watch();
        opening = openView(node, view, services, state, connect, {
          current: () => visit === visits,
          unwatch: () => removal.disconnect(),
          end: () => {
            removal.disconnect();
            sight.disconnect();
          },
        });
      }
    });
    sight.observe(node);
    return node;
  };
}
