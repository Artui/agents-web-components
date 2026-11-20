import { afterEach, describe, expect, it } from "vitest";
import { viewCsp } from "../../src/mcp_apps/view_csp.js";

/**
 * The shipped sandbox proxy page's script, run in a same-origin frame of this
 * page so its coverage counts. The page as built and served on another origin
 * is driven end to end in mcp_app_view_frame.browser.test.ts.
 */

const READY = "ui/notifications/sandbox-proxy-ready";
const RESOURCE = "ui/notifications/sandbox-resource-ready";
const NAVIGATED = "ui/notifications/sandbox-view-navigated";

interface Received {
  readonly source: MessageEventSource | null;
  readonly data: Readonly<Record<string, unknown>> | null;
}

afterEach(() => {
  document.body.innerHTML = "";
});

async function until<T>(read: () => T | undefined, what: string): Promise<T> {
  for (let i = 0; i < 100; i += 1) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

const VIEW = `<script>
  addEventListener("message", (event) => parent.postMessage({ kind: "echo", data: event.data }, "*"));
  parent.postMessage({ kind: "booted", csp: document.head.firstElementChild.getAttribute("content"), origin: window.origin }, "*");
</script>`;

/** Runs the proxy's script in a fresh same-origin frame; collects what reaches this page. */
async function proxy(): Promise<{
  win: Window;
  inner: () => HTMLIFrameElement;
  received: Received[];
  stop: () => void;
}> {
  const { runSandboxProxy } = await import("../../src/mcp_apps/sandbox_proxy_page.js");
  const host = document.createElement("iframe");
  document.body.append(host);
  const win = host.contentWindow as Window;
  const received: Received[] = [];
  const collect = (event: MessageEvent): void => {
    received.push({ source: event.source, data: event.data });
  };
  window.addEventListener("message", collect);
  runSandboxProxy(win);
  return {
    win,
    inner: () => win.document.querySelector("iframe") as HTMLIFrameElement,
    received,
    stop: () => window.removeEventListener("message", collect),
  };
}

function find(received: Received[], kind: string): Promise<Received> {
  return until(() => received.find((entry) => entry.data?.["kind"] === kind), kind);
}

describe("the sandbox proxy page", () => {
  it("says it is ready, then frames the view with its CSP, sandboxed to scripts alone", async () => {
    const { win, inner, received, stop } = await proxy();
    // Run from this page's realm, what it posts carries this page as its source,
    // so which window speaks is checked end to end, on the built page.
    await until(() => received.find((entry) => entry.data?.["method"] === READY), "proxy-ready");

    win.postMessage(
      {
        jsonrpc: "2.0",
        method: RESOURCE,
        params: {
          html: VIEW,
          csp: { connectDomains: ["https://api.example", "https://x.example; script-src *"] },
          sandbox: "allow-scripts allow-same-origin allow-top-navigation",
        },
      },
      "*",
    );
    const booted = await find(received, "booted");
    stop();

    expect(inner().getAttribute("sandbox")).toBe("allow-scripts");
    expect(booted.data?.["origin"]).toBe("null");
    expect(booted.data?.["csp"]).toBe(viewCsp({ connectDomains: ["https://api.example"] }).policy);
  });

  it("takes the first resource it is sent, and only from its parent", async () => {
    const { win, inner, received, stop } = await proxy();
    const other = document.createElement("iframe");
    document.body.append(other);
    const otherWin = other.contentWindow as Window & { eval(code: string): unknown };
    // From a third window: posted by a script of that window, so it is the source.
    otherWin.eval(
      `parent.document.querySelector("iframe").contentWindow.postMessage(${JSON.stringify({
        method: RESOURCE,
        params: { html: "<p>third</p>" },
      })}, "*")`,
    );
    win.postMessage(null, "*");
    win.postMessage({ method: RESOURCE, params: null }, "*");
    win.postMessage({ method: RESOURCE, params: { html: 42 } }, "*");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(inner().srcdoc).toBe("");
    const third = (entry: Received): boolean =>
      (entry.data?.["params"] as { html?: unknown } | undefined)?.html === "<p>third</p>";
    expect(received.filter(third)).toHaveLength(0);

    win.postMessage({ method: RESOURCE, params: { html: VIEW } }, "*");
    await find(received, "booted");
    const first = inner().srcdoc;
    win.postMessage({ method: RESOURCE, params: { html: "<p>second</p>" } }, "*");
    win.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-input" }, "*");
    const echo = await find(received, "echo");
    stop();

    expect(inner().srcdoc).toBe(first);
    expect(echo.data?.["data"]).toEqual({ jsonrpc: "2.0", method: "ui/notifications/tool-input" });
    expect(received.filter((entry) => entry.data?.["kind"] === "booted")).toHaveLength(1);
  });

  it("tells its parent the view navigated, and relays nothing from the page it reached", async () => {
    const { win, inner, received, stop } = await proxy();
    win.postMessage(
      {
        method: RESOURCE,
        params: {
          html: `<script>
            parent.postMessage({ kind: "booted" }, "*");
            setTimeout(() => { location.href = "data:text/html,<script>parent.postMessage({ kind: 'reached' }, '*')<\\/script>"; }, 30);
          </script>`,
        },
      },
      "*",
    );
    await find(received, "booted");
    const navigated = await until(
      () => received.find((entry) => entry.data?.["method"] === NAVIGATED),
      "navigated",
    );
    win.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-input" }, "*");
    await new Promise((resolve) => setTimeout(resolve, 200));
    stop();

    expect(navigated.data).toEqual({ jsonrpc: "2.0", method: NAVIGATED, params: {} });
    expect(inner()).toBeNull();
    expect(received.filter((entry) => entry.data?.["kind"] === "reached")).toHaveLength(0);
  });
});
