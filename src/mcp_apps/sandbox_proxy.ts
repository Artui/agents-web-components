import type { McpAppViewCspDomains } from "./view_csp.js";

/** The proxy says it can take the view's HTML. */
const SANDBOX_PROXY_READY = "ui/notifications/sandbox-proxy-ready";
/** The host hands the proxy the view's HTML and CSP. */
const SANDBOX_RESOURCE_READY = "ui/notifications/sandbox-resource-ready";

/** A view frame loaded through a sandbox proxy. */
export interface SandboxProxy {
  /** Posts a message to the proxy, which relays it to the view: only to the proxy's origin. */
  post(message: unknown): void;
  /** Stops answering the proxy. */
  dispose(): void;
}

/**
 * Loads `frame` from the host's sandbox proxy, the MCP Apps web host's way
 * (2026-01-26, apps.mdx "Sandbox proxy"): the frame is the proxy's own
 * origin with `allow-scripts allow-same-origin`, and once the proxy sends
 * `ui/notifications/sandbox-proxy-ready` it is sent the view's HTML and CSP in
 * `ui/notifications/sandbox-resource-ready`. The CSP also rides on the URL as
 * `?csp=`, where the specification's reference proxy reads it to set its
 * header before its page loads. Only messages from the frame's window and the
 * proxy's origin are read.
 *
 * Call it before `frame` is in the document, so the proxy cannot be ready
 * before this listens.
 */
export function sandboxProxy(
  frame: HTMLIFrameElement,
  proxyUrl: string,
  html: string,
  csp: McpAppViewCspDomains,
): SandboxProxy {
  const url = new URL(proxyUrl, document.baseURI);
  url.searchParams.set("csp", JSON.stringify(csp));
  const origin = url.origin;
  const onMessage = (event: MessageEvent): void => {
    if (event.source !== frame.contentWindow || event.origin !== origin) {
      return;
    }
    const data: unknown = event.data;
    if ((data as { readonly method?: unknown } | null)?.method !== SANDBOX_PROXY_READY) {
      return;
    }
    (event.source as Window).postMessage(
      { jsonrpc: "2.0", method: SANDBOX_RESOURCE_READY, params: { html, csp } },
      origin,
    );
  };
  window.addEventListener("message", onMessage);
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.src = url.href;
  return {
    post: (message) => frame.contentWindow?.postMessage(message, origin),
    dispose: () => window.removeEventListener("message", onMessage),
  };
}
