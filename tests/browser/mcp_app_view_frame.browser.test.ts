import { afterEach, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import type { McpAppsServices, McpAppView } from "../../src/mcp_apps/types.js";
import { viewCsp } from "../../src/mcp_apps/view_csp.js";
import { type McpAppViewChannel, viewFrame } from "../../src/mcp_apps/view_frame.js";
import { registerMcpApps } from "../../src/mcp_apps.js";
import { DEFAULT_UI_STRINGS } from "../../src/ui/ui_strings.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * The view frame in a real browser: what a CSP blocks, what a frame inherits,
 * and when a frame loads, navigates or leaves are what is at stake, and
 * happy-dom enforces no CSP, loads no frame and never reports an intersection.
 */

const URI = "ui://weather/view.html";

interface Received {
  readonly source: MessageEventSource | null;
  readonly data: Readonly<Record<string, unknown>>;
}

let received: Received[] = [];
const collect = (event: MessageEvent): void => {
  received.push({ source: event.source, data: event.data });
};

beforeAll(() => {
  defineChat();
  window.addEventListener("message", collect);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  received = [];
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

function message(kind: string): Promise<Received> {
  return until(() => received.find((entry) => entry.data?.["kind"] === kind), kind);
}

function view(): McpAppView {
  return {
    messageId: "m1",
    activity: { resourceUri: URI, toolInput: {}, result: { content: [] }, serverId: "weather" },
    live: true,
  };
}

function services(html: string, csp?: unknown, sandboxProxyUrl?: string): McpAppsServices {
  return {
    host: {
      registerActivityRenderer: vi.fn(),
      request: vi.fn(),
      sendMessage: vi.fn(),
      uiStrings: DEFAULT_UI_STRINGS,
      colorScheme: "light",
      locale: "en",
      tokenValues: () => ({}),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    route: vi.fn(async () => ({ contents: [{ uri: URI, text: html, _meta: { ui: { csp } } }] })),
    sandboxProxyUrl,
    views: new WeakMap(),
    resources: new Map(),
  };
}

/** Draws a view into the page, where it is in view, and waits for its frame. */
async function drawn(
  deps: McpAppsServices,
  connect = vi.fn((_channel: McpAppViewChannel) => vi.fn()),
): Promise<{ node: HTMLElement; frame: HTMLIFrameElement }> {
  const node = viewFrame(connect)(view(), deps);
  document.body.append(node);
  const frame = await until(() => node.querySelector("iframe") ?? undefined, "the frame");
  return { node, frame };
}

/**
 * The same server under another loopback name, so another origin. Which names
 * the server listens on depends on how the machine resolves localhost, so the
 * first that answers is used.
 */
async function otherOrigin(): Promise<string> {
  const { protocol, hostname, port } = window.location;
  for (const host of ["127.0.0.1", "[::1]", "localhost"]) {
    if (host === hostname) {
      continue;
    }
    const origin = `${protocol}//${host}:${port}`;
    try {
      await fetch(`${origin}/`, { mode: "no-cors" });
      return origin;
    } catch {
      // Not listening under this name.
    }
  }
  throw new Error("the test server answers on no second loopback name");
}

describe("a srcdoc frame", () => {
  it("inherits its parent's CSP, so a strict host page blocks a srcdoc view's scripts", async () => {
    const parent = document.createElement("iframe");
    parent.srcdoc = `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`;
    document.body.append(parent);
    await new Promise((resolve) => parent.addEventListener("load", resolve, { once: true }));
    const doc = parent.contentDocument as Document;
    const child = doc.createElement("iframe");
    child.setAttribute("sandbox", "allow-scripts");
    child.srcdoc = `<script>parent.parent.postMessage({ kind: "ran" }, "*")</script>`;
    const control = doc.createElement("iframe");
    control.setAttribute("sandbox", "allow-scripts");
    control.srcdoc = `<script>parent.postMessage({ kind: "control" }, "*")</script>`;

    doc.body.append(child);
    document.body.append(control);
    await message("control");
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(received.some((entry) => entry.data?.["kind"] === "ran")).toBe(false);
  });
});

describe("viewFrame", () => {
  it("draws a view in <ag-ui-chat> in an opaque-origin frame, read from options.url", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "embedded");
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit: Emit) =>
          emit.activity("mcp-apps", { ...view().activity, serverId: "weather" }, "a1"),
      }).agent;
    const request = vi.spyOn(el, "request").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            contents: [
              {
                uri: URI,
                text: `<script>parent.postMessage({ kind: "booted", origin: String(window.origin) }, "*")</script>`,
              },
            ],
          }),
        ),
    );
    registerMcpApps(el, { url: "/agent/mcp-apps/" });
    document.body.append(el);

    void el.sendMessage("weather in Oslo");
    const booted = await message("booted");
    const frame = (el.shadowRoot as ShadowRoot).querySelector(
      ".mcp-app-view iframe",
    ) as HTMLIFrameElement;

    expect(request.mock.calls[0]?.[0]).toBe("/agent/mcp-apps/");
    expect(booted.source).toBe(frame.contentWindow);
    expect(booted.data["origin"]).toBe("null");
  });

  it("enforces the CSP from the first element, before a script written ahead of <head>", async () => {
    await drawn(
      services(
        `<script>
          document.addEventListener("securitypolicyviolation", (event) =>
            parent.postMessage(
              { kind: "violation", directive: event.effectiveDirective, uri: event.blockedURI },
              "*",
            ),
          );
          new Image().src = "https://undeclared.example/pixel.png";
        </script><html><head><title>view</title></head><body></body></html>`,
      ),
    );

    const violation = await message("violation");

    expect(violation.data["directive"]).toBe("img-src");
    expect(violation.data["uri"]).toContain("undeclared.example");
  });

  it("drops a declared domain that would smuggle a keyword into the policy", async () => {
    await drawn(
      services(
        `<script>
          let outcome = "eval refused";
          try { eval("1"); outcome = "eval ran"; } catch {}
          parent.postMessage({ kind: "eval", outcome }, "*");
        </script>`,
        { resourceDomains: ["'unsafe-eval'", "https://cdn.example 'unsafe-eval'"] },
      ),
    );

    expect((await message("eval")).data["outcome"]).toBe("eval refused");
  });

  it("tears the view down when it navigates its frame", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const disconnect = vi.fn();
    const { node } = await drawn(
      services(`<script>setTimeout(() => { location.href = "about:blank"; }, 30)</script>`),
      vi.fn(() => disconnect),
    );

    await until(() => (node.querySelector("iframe") === null ? true : undefined), "teardown");

    expect(node.textContent).toContain(`An app view can't be shown here: ${URI}`);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `ag-ui-chat: the MCP App view ${URI} navigated its frame and was closed`,
    );
  });

  it("keeps the view framed when the page moves it, and the view boots again", async () => {
    const disconnect = vi.fn();
    const connect = vi.fn((_channel: McpAppViewChannel) => disconnect);
    const { node, frame } = await drawn(
      services(`<script>parent.postMessage({ kind: "booted" }, "*")</script>`),
      connect,
    );
    await message("booted");
    const before = frame.contentWindow;
    const elsewhere = document.createElement("section");
    document.body.append(elsewhere);

    elsewhere.append(node);
    await until(
      () =>
        received.filter((entry) => entry.data?.["kind"] === "booted").length > 1 ? true : undefined,
      "a second boot",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    const channel = connect.mock.calls[0]?.[0] as McpAppViewChannel;
    expect(node.querySelector("iframe")).toBe(frame);
    expect(frame.contentWindow === before).toBe(false);
    expect(channel.source === frame.contentWindow).toBe(true);
    expect(node.querySelector(".run-notice")).toBeNull();
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("frames the view again when it returns to the document", async () => {
    const disconnect = vi.fn();
    const connect = vi.fn((_channel: McpAppViewChannel) => disconnect);
    const deps = services("<p>view</p>");
    const { node } = await drawn(deps, connect);

    node.remove();
    await until(() => (disconnect.mock.calls.length > 0 ? true : undefined), "disconnect");
    document.body.append(node);
    await until(() => (connect.mock.calls.length > 1 ? true : undefined), "a second frame");

    expect(node.querySelectorAll("iframe")).toHaveLength(1);
    expect(deps.route).toHaveBeenCalledTimes(1);
  });

  it("stops the bridge when the view leaves the document", async () => {
    const disconnect = vi.fn();
    const { node } = await drawn(
      services("<p>view</p>"),
      vi.fn(() => disconnect),
    );

    node.remove();

    await until(() => (disconnect.mock.calls.length > 0 ? true : undefined), "disconnect");
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("loads a view through the shipped sandbox proxy page, on the proxy's origin", async () => {
    const proxyUrl = `${await otherOrigin()}/${inject("sandboxProxyPage")}`;
    const connect = vi.fn((_channel: McpAppViewChannel) => vi.fn());
    const { frame } = await drawn(
      services(
        `<script>
          addEventListener("message", (event) => parent.postMessage({ kind: "echo", data: event.data }, "*"));
          const meta = document.head.firstElementChild;
          parent.postMessage({ kind: "booted", csp: meta.getAttribute("content") }, "*");
        </script>`,
        { connectDomains: ["https://api.example", "https://x.example; script-src *"] },
        proxyUrl,
      ),
      connect,
    );

    // A proxy-ready from anywhere but the proxy's frame is not answered.
    window.postMessage({ jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready" }, "*");
    const booted = await message("booted");
    connect.mock.calls[0]?.[0].post({ jsonrpc: "2.0", method: "ui/notifications/tool-input" });
    const echo = await message("echo");

    const cleaned = viewCsp({ connectDomains: ["https://api.example"] });
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(connect.mock.calls[0]?.[0].origin).toBe(new URL(proxyUrl).origin);
    expect(new URL(frame.src).searchParams.get("csp")).toBe(JSON.stringify(cleaned.domains));
    expect(booted.data["csp"]).toBe(cleaned.policy);
    expect(booted.source).toBe(frame.contentWindow);
    expect(received.filter((entry) => entry.data?.["kind"] === "booted")).toHaveLength(1);
    expect(echo.data["data"]).toEqual({ jsonrpc: "2.0", method: "ui/notifications/tool-input" });

    connect.mock.calls[0]?.[0].close();
    expect(frame.isConnected).toBe(false);
  });
});
