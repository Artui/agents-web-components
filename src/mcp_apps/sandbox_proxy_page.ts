import { viewCsp, withCspMeta } from "./view_csp.js";

/** The proxy says it can take the view's HTML. */
const SANDBOX_PROXY_READY = "ui/notifications/sandbox-proxy-ready";
/** The host hands the proxy the view's HTML and CSP. */
const SANDBOX_RESOURCE_READY = "ui/notifications/sandbox-resource-ready";
/** This proxy tells its parent the view navigated its frame: a host-private sandbox- message. */
const SANDBOX_VIEW_NAVIGATED = "ui/notifications/sandbox-view-navigated";

/**
 * The script of the sandbox proxy page the package ships
 * (`./mcp-apps/sandbox-proxy.html`), run in `win`, the page a host serves on
 * another origin and names as `sandboxProxyUrl`.
 *
 * It draws one inner frame, `sandbox="allow-scripts"` whatever the host asks,
 * so the view has an opaque origin and cannot script this page. It says
 * `ui/notifications/sandbox-proxy-ready` to its parent; the first
 * `ui/notifications/sandbox-resource-ready` from the parent puts the view's
 * HTML in the inner frame with the CSP built from its `csp` as the first
 * element of its head, and any later one is ignored. After that it relays:
 * the parent's messages to the view, and the view's to the parent. Messages
 * from any other window are dropped. A second load of the inner frame is the
 * view navigating it, which this page's own frame never shows its parent: the
 * inner frame is removed and `ui/notifications/sandbox-view-navigated` sent.
 */
export function runSandboxProxy(win: Window): void {
  const doc = win.document;
  const inner = doc.createElement("iframe");
  inner.setAttribute("sandbox", "allow-scripts");
  inner.title = "MCP App view";
  doc.body.append(inner);
  let loaded = false;
  let shown = false;
  const onLoad = (): void => {
    if (!shown) {
      shown = true;
      return;
    }
    inner.remove();
    win.parent.postMessage({ jsonrpc: "2.0", method: SANDBOX_VIEW_NAVIGATED, params: {} }, "*");
  };
  win.addEventListener("message", (event) => {
    const data: unknown = event.data;
    if (event.source === win.parent) {
      const message = data as { readonly method?: unknown; readonly params?: unknown } | null;
      if (message?.method !== SANDBOX_RESOURCE_READY) {
        inner.contentWindow?.postMessage(data, "*");
        return;
      }
      const params = message.params as { readonly html?: unknown; readonly csp?: unknown } | null;
      if (!loaded && typeof params?.html === "string") {
        loaded = true;
        inner.addEventListener("load", onLoad);
        inner.srcdoc = withCspMeta(params.html, viewCsp(params.csp).policy);
      }
    } else if (event.source !== null && event.source === inner.contentWindow) {
      win.parent.postMessage(data, "*");
    }
  });
  win.parent.postMessage({ jsonrpc: "2.0", method: SANDBOX_PROXY_READY, params: {} }, "*");
}
