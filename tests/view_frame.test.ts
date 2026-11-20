import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mcpAppsRenderer } from "../src/mcp_apps/mcp_apps_renderer.js";
import type { McpAppsServices, McpAppView } from "../src/mcp_apps/types.js";
import {
  type McpAppViewChannel,
  type McpAppViewConnect,
  viewFrame,
} from "../src/mcp_apps/view_frame.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { FakeIntersectionObserver } from "./helpers/fake_intersection.js";

const URI = "ui://weather/view.html";

function view(serverId = "weather", live = true): McpAppView {
  return {
    messageId: "m1",
    activity: { resourceUri: URI, toolInput: {}, result: { content: [] }, serverId },
    live,
  };
}

function services(
  route: McpAppsServices["route"] = vi.fn(async () => ({
    contents: [{ uri: URI, text: "<p>forecast</p>" }],
  })),
  sandboxProxyUrl?: string,
): McpAppsServices {
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
    route,
    sandboxProxyUrl,
    views: new WeakMap(),
    resources: new Map(),
    overlay: { exit: null },
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Draws a view into the document and scrolls it into view. */
async function shown(
  deps: McpAppsServices,
  connect: McpAppViewConnect = vi.fn(() => vi.fn()),
  drawn: McpAppView = view(),
): Promise<HTMLElement> {
  const node = viewFrame(connect)(drawn, deps);
  document.body.append(node);
  FakeIntersectionObserver.show(node);
  await flush();
  return node;
}

beforeEach(() => {
  FakeIntersectionObserver.install();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("viewFrame", () => {
  it("registers the node it draws, with the view's live state", () => {
    const deps = services();

    const node = viewFrame(vi.fn())(view("weather", false), deps);

    expect(deps.views.get(node)).toEqual({ live: false });
  });

  it("reads nothing while the node is out of view", async () => {
    const deps = services();
    const node = viewFrame(vi.fn())(view(), deps);
    document.body.append(node);

    FakeIntersectionObserver.report(node, false);
    await flush();

    expect(deps.route).not.toHaveBeenCalled();
    expect(node.childElementCount).toBe(0);
  });

  it("reads each server's resource once per page, and frames every view of it", async () => {
    const deps = services();

    const first = await shown(deps);
    const second = await shown(deps);
    await shown(deps, undefined, view("other"));
    FakeIntersectionObserver.show(first);
    await flush();

    expect(deps.route).toHaveBeenCalledTimes(2);
    expect(vi.mocked(deps.route).mock.calls.map(([request]) => request.serverId)).toEqual([
      "weather",
      "other",
    ]);
    expect(first.querySelectorAll("iframe")).toHaveLength(1);
    expect(second.querySelector("iframe")).not.toBeNull();
  });

  it("puts the CSP first in the head, ahead of a script written before it", async () => {
    const html = "<script>window.early = 1</script><html><head><title>v</title></head></html>";
    const node = await shown(services(vi.fn(async () => ({ contents: [{ text: html }] }))));

    const srcdoc = (node.querySelector("iframe") as HTMLIFrameElement).srcdoc;
    const doc = new DOMParser().parseFromString(srcdoc, "text/html");
    const first = doc.head.firstElementChild as HTMLMetaElement;

    expect(srcdoc.startsWith("<!doctype html>")).toBe(true);
    expect(first.httpEquiv).toBe("Content-Security-Policy");
    expect(first.content).toContain("default-src 'none'");
    expect(doc.querySelector("script")?.textContent).toBe("window.early = 1");
  });

  it("builds the CSP from the resource's _meta.ui.csp", async () => {
    const route = vi.fn(async () => ({
      contents: [
        {
          text: "<p>v</p>",
          _meta: { ui: { csp: { connectDomains: ["https://api.example", "x; y"] } } },
        },
      ],
    }));
    const node = await shown(services(route));

    const srcdoc = (node.querySelector("iframe") as HTMLIFrameElement).srcdoc;
    const meta = new DOMParser()
      .parseFromString(srcdoc, "text/html")
      .head.querySelector("meta") as HTMLMetaElement;

    expect(meta.content).toContain("connect-src https://api.example;");
    expect(meta.content).not.toContain("x; y");
  });

  it("decodes a base64 blob resource as UTF-8", async () => {
    const bytes = new TextEncoder().encode("<p>Zürich ☀</p>");
    const blob = btoa(String.fromCharCode(...bytes));
    const node = await shown(
      services(vi.fn(async () => ({ contents: [{ blob, _meta: { ui: { csp: {} } } }] }))),
    );

    expect((node.querySelector("iframe") as HTMLIFrameElement).srcdoc).toContain("<p>Zürich ☀</p>");
  });

  it.each([
    ["a route that refuses", () => Promise.reject(new Error("403"))],
    ["a result with no contents", async () => ({})],
    ["contents that are not objects", async () => ({ contents: ["<p>"] })],
    ["content with neither text nor blob", async () => ({ contents: [{ uri: URI }] })],
  ])("draws the notice and warns for %s, and reads again next time", async (_name, answer) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const route = vi.fn(answer);
    const deps = services(route as McpAppsServices["route"]);

    const node = await shown(deps);
    await shown(deps);

    expect(node.querySelector("iframe")).toBeNull();
    expect(node.textContent).toContain(`An app view can't be shown here: ${URI}`);
    expect(warn).toHaveBeenCalledWith(
      `ag-ui-chat: the MCP App view ${URI} could not be read`,
      expect.any(Error),
    );
    expect(route).toHaveBeenCalledTimes(2);
  });

  it("does not frame a view that left the document while its resource was read", async () => {
    let answer: (value: Record<string, unknown>) => void = () => undefined;
    const route = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          answer = resolve;
        }),
    );
    const connect = vi.fn(() => vi.fn());
    const node = viewFrame(connect)(view(), services(route));
    document.body.append(node);
    FakeIntersectionObserver.show(node);

    node.remove();
    FakeIntersectionObserver.report(node, false);
    answer({ contents: [{ text: "<p>v</p>" }] });
    await flush();

    expect(node.querySelector("iframe")).toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });

  it("reads nothing for a node that left the document before it was ever shown", () => {
    const deps = services();
    const node = viewFrame(vi.fn())(view(), deps);
    document.body.append(node);
    node.remove();

    FakeIntersectionObserver.report(node, false);
    FakeIntersectionObserver.show(node);

    expect(deps.route).not.toHaveBeenCalled();
  });

  it("connects the bridge to the frame, and disconnects it once when the node leaves", async () => {
    const disconnect = vi.fn();
    const connect = vi.fn((_channel: McpAppViewChannel) => disconnect);
    const deps = services();
    const node = await shown(deps, connect);
    const frame = node.querySelector("iframe") as HTMLIFrameElement;
    const channel = connect.mock.calls[0]?.[0] as McpAppViewChannel;

    expect(channel.iframe).toBe(frame);
    expect(channel.source).toBe(frame.contentWindow);
    expect(channel.origin).toBe("null");
    expect(connect.mock.calls[0]?.slice(1)).toEqual([view(), deps]);

    node.remove();
    FakeIntersectionObserver.report(node, false);
    await flush();
    channel.close();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(node.querySelector(".run-notice")).toBeNull();
  });

  it("stops the bridge when the node leaves with no change in sight to report it", async () => {
    const disconnect = vi.fn();
    const node = await shown(
      services(),
      vi.fn(() => disconnect),
    );

    node.remove();
    await flush();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(node.querySelector("iframe")).toBeNull();
  });

  it("stops the bridge when the shadow root it is framed in drops it", async () => {
    const disconnect = vi.fn();
    const chat = document.createElement("div");
    const root = chat.attachShadow({ mode: "open" });
    document.body.append(chat);
    const node = viewFrame(vi.fn(() => disconnect))(view(), services());
    root.append(node);
    FakeIntersectionObserver.show(node);
    await flush();

    root.replaceChildren();
    await flush();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("stops the bridge when the shadow root it was moved into drops it", async () => {
    const disconnect = vi.fn();
    const node = await shown(
      services(),
      vi.fn(() => disconnect),
    );
    const chat = document.createElement("div");
    const root = chat.attachShadow({ mode: "open" });
    document.body.append(chat);

    root.append(node);
    await flush();
    root.replaceChildren();
    await flush();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("stops the bridge when the shadow root the node was moved into leaves", async () => {
    const disconnect = vi.fn();
    const node = await shown(
      services(),
      vi.fn(() => disconnect),
    );
    const chat = document.createElement("div");
    const root = chat.attachShadow({ mode: "open" });
    document.body.append(chat);

    root.append(node);
    await flush();
    expect(disconnect).not.toHaveBeenCalled();
    chat.remove();
    await flush();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("frames the view again from the cache when the node comes back into view", async () => {
    const connect = vi.fn((_channel: McpAppViewChannel) => vi.fn());
    const deps = services();
    const node = await shown(deps, connect);

    node.remove();
    FakeIntersectionObserver.report(node, false);
    await flush();
    expect(node.querySelector("iframe")).toBeNull();
    document.body.append(node);
    FakeIntersectionObserver.show(node);
    await flush();

    expect(node.querySelectorAll("iframe")).toHaveLength(1);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(deps.route).toHaveBeenCalledTimes(1);
  });

  it("frames a view once when it leaves and returns while its resource is read", async () => {
    let answer: (value: Record<string, unknown>) => void = () => undefined;
    const route = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          answer = resolve;
        }),
    );
    const connect = vi.fn(() => vi.fn());
    const node = viewFrame(connect)(view(), services(route));
    document.body.append(node);
    FakeIntersectionObserver.show(node);

    node.remove();
    FakeIntersectionObserver.report(node, false);
    document.body.append(node);
    FakeIntersectionObserver.show(node);
    answer({ contents: [{ text: "<p>v</p>" }] });
    await flush();

    expect(node.querySelectorAll("iframe")).toHaveLength(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it("gives the bridge the view's live state as a redraw changes it", async () => {
    const connect = vi.fn((_channel: McpAppViewChannel) => vi.fn());
    const deps = services();
    const node = await shown(deps, connect);
    const channel = connect.mock.calls[0]?.[0] as McpAppViewChannel;

    expect(channel.live).toBe(true);
    (deps.views.get(node) as { live: boolean }).live = false;
    expect(channel.live).toBe(false);
  });

  it("turns a drawn view's channel not live when the renderer redraws it from a replay", async () => {
    const connect = vi.fn((_channel: McpAppViewChannel) => vi.fn());
    const render = mcpAppsRenderer(viewFrame(connect), services());
    const content = view().activity;
    const node = render(content, { messageId: "m1", previous: null, live: true }) as HTMLElement;
    document.body.append(node);
    FakeIntersectionObserver.show(node);
    await flush();
    const channel = connect.mock.calls[0]?.[0] as McpAppViewChannel;

    const redrawn = render(content, { messageId: "m1", previous: node, live: false });

    expect(redrawn).toBe(node);
    expect(channel.live).toBe(false);
  });

  it("posts the bridge's messages into the srcdoc frame, to any origin", async () => {
    const connect = vi.fn((_channel: McpAppViewChannel) => vi.fn());
    const node = await shown(services(), connect);
    const frame = node.querySelector("iframe") as HTMLIFrameElement;
    const post = vi.spyOn(frame.contentWindow as Window, "postMessage");

    connect.mock.calls[0]?.[0].post({ jsonrpc: "2.0", method: "ui/notifications/tool-input" });

    expect(post).toHaveBeenCalledWith(
      { jsonrpc: "2.0", method: "ui/notifications/tool-input" },
      "*",
    );
  });

  it("frames a view closed to the notice never again, and stops its sight observer", async () => {
    const connect = vi.fn((_channel: McpAppViewChannel) => vi.fn());
    const node = await shown(services(), connect);

    connect.mock.calls[0]?.[0].close();
    node.remove();
    await flush();
    document.body.append(node);
    FakeIntersectionObserver.show(node);
    await flush();

    expect(connect).toHaveBeenCalledTimes(1);
    expect(node.querySelector("iframe")).toBeNull();
    expect(FakeIntersectionObserver.observers.every((observer) => observer.disconnected)).toBe(
      true,
    );
  });

  it("closes the view on the bridge's word: frame gone, notice drawn, bridge stopped", async () => {
    const disconnect = vi.fn();
    const connect = vi.fn((_channel: McpAppViewChannel) => disconnect);
    const node = await shown(services(), connect);

    connect.mock.calls[0]?.[0].close();
    connect.mock.calls[0]?.[0].close();

    expect(node.querySelector("iframe")).toBeNull();
    expect(node.textContent).toContain(`An app view can't be shown here: ${URI}`);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe("viewFrame's removal watch", () => {
  class Tracked extends MutationObserver {
    static readonly live = new Set<Tracked>();
    override observe(target: Node, options?: MutationObserverInit): void {
      Tracked.live.add(this);
      super.observe(target, options);
    }
    override disconnect(): void {
      Tracked.live.delete(this);
      super.disconnect();
    }
  }

  beforeEach(() => {
    Tracked.live.clear();
    vi.stubGlobal("MutationObserver", Tracked);
  });

  it("stops watching once the node leaves", async () => {
    const node = await shown(services());
    expect(Tracked.live.size).toBe(1);

    node.remove();
    await flush();

    expect(Tracked.live.size).toBe(0);
  });

  it("stops watching when the resource cannot be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const node = await shown(services(vi.fn(async () => Promise.reject(new Error("down")))));

    expect(node.isConnected).toBe(true);
    expect(Tracked.live.size).toBe(0);
  });

  it("stops watching once the view is closed to the notice", async () => {
    const connect = vi.fn((_channel: McpAppViewChannel) => vi.fn());
    const node = await shown(services(), connect);

    connect.mock.calls[0]?.[0].close();

    expect(node.isConnected).toBe(true);
    expect(Tracked.live.size).toBe(0);
  });
});
