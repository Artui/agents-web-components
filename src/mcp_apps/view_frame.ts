import { renderMcpAppNotice } from "../ui/progress/mcp_app_notice.js";
import { sandboxProxy } from "./sandbox_proxy.js";
import type {
  McpAppResource,
  McpAppsServices,
  McpAppView,
  McpAppViewActivity,
  McpAppViewMount,
  McpAppViewState,
} from "./types.js";
import { viewCsp } from "./view_csp.js";

/** What the host bridge drives one view's document through. */
export interface McpAppViewChannel {
  readonly iframe: HTMLIFrameElement;
  /**
   * The window the view's messages arrive from: match `event.source` against
   * it. Through a proxy it is the proxy's window, whose own
   * `ui/notifications/sandbox-` messages the frame answers.
   */
  readonly source: Window;
  /** Posts a message to the view, through the proxy when there is one. */
  post(message: unknown): void;
  /** Whether the view may act now: a redraw of its message can change it. */
  readonly live: boolean;
  /** Tears the view down, drawing the notice in its place. */
  close(): void;
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

/**
 * The view's HTML with `policy` as the first element of its `<head>`. Parsed
 * rather than spliced, so a script before `<head>`, or a `<head>` inside a
 * comment, cannot run ahead of the policy.
 */
function withCsp(html: string, policy: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", policy);
  doc.head.prepend(meta);
  return `<!doctype html>${doc.documentElement.outerHTML}`;
}

/** Puts the view's frame in `node`; resolves to what tears it down. */
async function openView(
  node: HTMLElement,
  view: McpAppView,
  services: McpAppsServices,
  state: McpAppViewState,
  connect: McpAppViewConnect,
): Promise<(notice: boolean) => void> {
  const uri = view.activity.resourceUri;
  let resource: McpAppResource;
  try {
    resource = await readResource(services, view.activity);
  } catch (error) {
    console.warn(`ag-ui-chat: the MCP App view ${uri} could not be read`, error);
    showNotice(node, view, services);
    return noop;
  }
  if (!node.isConnected) {
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
  const proxyUrl = services.sandboxProxyUrl;
  let post: (message: unknown) => void;
  let dispose: () => void = noop;
  if (proxyUrl === undefined) {
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.srcdoc = withCsp(resource.html, csp.policy);
    post = (message) => iframe.contentWindow?.postMessage(message, "*");
  } else {
    const proxy = sandboxProxy(iframe, proxyUrl, resource.html, csp.domains);
    post = proxy.post;
    dispose = proxy.dispose;
  }
  let closed = false;
  let disconnect: () => void = noop;
  const close = (notice: boolean): void => {
    if (closed) {
      return;
    }
    closed = true;
    disconnect();
    dispose();
    iframe.remove();
    if (notice) {
      showNotice(node, view, services);
    }
  };
  // The src is set before the frame is placed, so its document loads once. A
  // second load is the view navigating its frame, which a CSP cannot forbid.
  let loads = 0;
  iframe.addEventListener("load", () => {
    loads += 1;
    if (loads > 1) {
      console.warn(`ag-ui-chat: the MCP App view ${uri} navigated its frame and was closed`);
      close(true);
    }
  });
  node.replaceChildren(iframe);
  disconnect = connect(
    {
      iframe,
      source: iframe.contentWindow as Window,
      post,
      get live() {
        return state.live;
      },
      close: () => close(true),
    },
    view,
    services,
  );
  return close;
}

/**
 * The mount `registerMcpApps` draws views with: a node that reads the view's
 * resource and puts its sandboxed frame in itself once it first scrolls into
 * view, and tears the frame down when it leaves the document.
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
    let opening: Promise<(notice: boolean) => void> | null = null;
    const observer = new IntersectionObserver((entries) => {
      if (!node.isConnected) {
        observer.disconnect();
        void opening?.then((close) => close(false));
        return;
      }
      if (opening === null && entries.some((entry) => entry.isIntersecting)) {
        opening = openView(node, view, services, state, connect);
      }
    });
    observer.observe(node);
    return node;
  };
}
