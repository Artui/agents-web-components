import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, MCP_APP_MAX_HEIGHT, THEME_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { hostBridge } from "../src/mcp_apps/host_bridge.js";
import { serverRoute } from "../src/mcp_apps/server_route.js";
import type { McpAppsHost, McpAppsServices, McpAppView } from "../src/mcp_apps/types.js";
import type { McpAppViewChannel } from "../src/mcp_apps/view_frame.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

/**
 * The host bridge's protocol, driven by hand: the paths a real view rarely
 * takes. `tests/browser/mcp_app_bridge.browser.test.ts` runs it against
 * django-spec-mcp's own view bridge in a real frame.
 */

const ORIGIN = "null";

interface Fixture {
  readonly posted: Record<string, unknown>[];
  readonly channel: McpAppViewChannel & { live: boolean };
  readonly source: Window;
  readonly host: { -readonly [K in keyof McpAppsHost]: McpAppsHost[K] } & {
    sendMessage: ReturnType<typeof vi.fn>;
  };
  readonly events: EventTarget;
  readonly services: McpAppsServices;
  readonly view: McpAppView;
  readonly close: ReturnType<typeof vi.fn>;
  readonly disconnect: () => void;
  readonly requestDisplayMode: ReturnType<typeof vi.fn>;
}

let fixtures: Fixture[] = [];

beforeAll(() => {
  defineChat();
});

afterEach(() => {
  for (const fixture of fixtures) {
    fixture.disconnect();
  }
  fixtures = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function connected(
  tokens: Readonly<Record<string, string>> = { "--_bg": "rgb(1, 2, 3)" },
): Fixture {
  const posted: Record<string, unknown>[] = [];
  // A stand-in: happy-dom loads no frame, and the bridge reads only its box.
  const iframe = document.createElement("div") as unknown as HTMLIFrameElement;
  document.body.append(iframe);
  const source = new EventTarget() as unknown as Window;
  const close = vi.fn();
  const channel = {
    iframe,
    source,
    origin: ORIGIN,
    post: (message: unknown) => posted.push(message as Record<string, unknown>),
    live: true,
    close,
  };
  const events = new EventTarget();
  const host = {
    registerActivityRenderer: vi.fn(),
    request: vi.fn(),
    sendMessage: vi.fn(async () => true),
    uiStrings: DEFAULT_UI_STRINGS,
    colorScheme: "light" as "light" | "dark",
    locale: "en",
    tokenValues: () => tokens,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
  };
  const services: McpAppsServices = {
    host,
    route: vi.fn(async () => ({ content: [] })),
    sandboxProxyUrl: undefined,
    views: new WeakMap(),
    resources: new Map(),
  };
  const view: McpAppView = {
    messageId: "m1",
    activity: {
      resourceUri: "ui://w/view.html",
      toolInput: { city: "Oslo" },
      result: { content: [] },
      serverId: "weather",
    },
    live: true,
  };
  const requestDisplayMode = vi.fn(() => "inline" as const);
  const disconnect = hostBridge(requestDisplayMode)(channel, view, services);
  const fixture = {
    events,
    posted,
    channel,
    source,
    host,
    services,
    view,
    close,
    disconnect,
    requestDisplayMode,
  };
  fixtures.push(fixture);
  return fixture;
}

function receive(
  fixture: Fixture,
  data: unknown,
  { source = fixture.source, origin = ORIGIN }: { source?: unknown; origin?: string } = {},
): void {
  window.dispatchEvent(
    new MessageEvent("message", { data, source: source as Window | null, origin }),
  );
}

function request(fixture: Fixture, id: number | string, method: string, params?: unknown): void {
  receive(fixture, { jsonrpc: "2.0", id, method, params });
}

function notify(fixture: Fixture, method: string, params?: unknown): void {
  receive(fixture, { jsonrpc: "2.0", method, params });
}

function initialised(fixture: Fixture): void {
  request(fixture, 1, "ui/initialize", {});
  notify(fixture, "ui/notifications/initialized");
  fixture.posted.length = 0;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("hostBridge", () => {
  it("answers ui/initialize with the host context, and sends nothing before initialized", () => {
    const fixture = connected({ "--_bg": "rgb(1, 2, 3)" });

    request(fixture, 1, "ui/initialize", { protocolVersion: "2026-01-26" });

    expect(fixture.posted).toHaveLength(1);
    expect(fixture.posted[0]).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2026-01-26",
        hostInfo: { name: "agents-web-components" },
        hostCapabilities: { openLinks: {}, serverTools: {}, message: { text: {} } },
        hostContext: {
          theme: "light",
          locale: "en",
          styles: { variables: { "--color-background-primary": "rgb(1, 2, 3)" } },
          availableDisplayModes: ["inline"],
          containerDimensions: { maxHeight: MCP_APP_MAX_HEIGHT },
        },
      },
    });
  });

  it("sends the tool input and result on initialized, even without an answered initialize", () => {
    const fixture = connected();

    notify(fixture, "ui/notifications/initialized");

    expect(fixture.posted).toEqual([
      {
        jsonrpc: "2.0",
        method: "ui/notifications/tool-input",
        params: { arguments: { city: "Oslo" } },
      },
      { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { content: [] } },
    ]);
  });

  it("tells an initialised view only what changed, and an uninitialised one nothing", () => {
    const fixture = connected();
    request(fixture, 1, "ui/initialize");
    fixture.host.colorScheme = "dark";
    fixture.events.dispatchEvent(new Event(THEME_EVENT));
    expect(fixture.posted).toHaveLength(1);

    notify(fixture, "ui/notifications/initialized");

    expect(fixture.posted.at(-1)).toEqual({
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: { theme: "dark" },
    });
  });

  it("sends no host-context-changed when nothing changed", () => {
    const fixture = connected();
    initialised(fixture);

    fixture.events.dispatchEvent(new Event(THEME_EVENT));

    expect(fixture.posted).toEqual([]);
  });

  it("leaves out a style variable whose token the chat does not declare", () => {
    const fixture = connected({});

    request(fixture, 1, "ui/initialize");

    const result = fixture.posted[0]?.["result"] as { hostContext: { styles: unknown } };
    expect(result.hostContext.styles).toEqual({ variables: {} });
  });

  it("reads only messages from the view's window and origin, in JSON-RPC", () => {
    const fixture = connected();
    const call = { jsonrpc: "2.0", id: 1, method: "ui/initialize" };

    receive(fixture, call, { source: null });
    receive(fixture, call, { source: window });
    receive(fixture, call, { origin: "https://elsewhere.example" });
    receive(fixture, "ui/initialize");
    receive(fixture, { id: 1, method: "ui/initialize" });
    receive(fixture, { jsonrpc: "2.0", id: 9, result: {} });

    expect(fixture.posted).toEqual([]);
  });

  it("treats a message with neither a string nor a number id as a notification", () => {
    const fixture = connected();

    receive(fixture, { jsonrpc: "2.0", id: null, method: "ui/notifications/initialized" });

    expect(fixture.posted[0]?.["method"]).toBe("ui/notifications/tool-input");
  });

  it("sets the frame's height from size-changed, between zero and the cap", () => {
    const fixture = connected();
    const { iframe } = fixture.channel;

    notify(fixture, "ui/notifications/size-changed", { height: 99.2 });
    expect(iframe.style.height).toBe("100px");
    notify(fixture, "ui/notifications/size-changed", { height: 10_000 });
    expect(iframe.style.height).toBe(`${MCP_APP_MAX_HEIGHT}px`);
    notify(fixture, "ui/notifications/size-changed", { height: -5 });
    expect(iframe.style.height).toBe("0px");
    notify(fixture, "ui/notifications/size-changed", { height: "tall" });
    notify(fixture, "ui/notifications/size-changed", { height: Number.NaN });
    notify(fixture, "ui/notifications/size-changed", "not params");
    expect(iframe.style.height).toBe("0px");
  });

  it("answers ui/request-display-mode with what its hook decides", () => {
    const fixture = connected();

    request(fixture, 4, "ui/request-display-mode", { mode: "fullscreen" });

    expect(fixture.requestDisplayMode).toHaveBeenCalledWith("fullscreen");
    expect(fixture.posted).toEqual([{ jsonrpc: "2.0", id: 4, result: { mode: "inline" } }]);
  });

  it("answers any other request -32601", () => {
    const fixture = connected();

    request(fixture, "a", "resources/read", { uri: "ui://other" });

    expect(fixture.posted).toEqual([
      {
        jsonrpc: "2.0",
        id: "a",
        error: { code: -32601, message: "this host does not implement resources/read" },
      },
    ]);
  });

  it.each([
    ["tools/call", { name: "forecast" }],
    ["ui/message", { role: "user", content: [{ type: "text", text: "hi" }] }],
    ["ui/open-link", { url: "https://example.com" }],
  ])("refuses %s while the view is not live", async (method, params) => {
    const fixture = connected();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    fixture.channel.live = false;

    request(fixture, 2, method, params);
    await settled();

    expect(fixture.posted[0]).toMatchObject({ id: 2, error: { code: -32000 } });
    expect(fixture.services.route).not.toHaveBeenCalled();
    expect(fixture.host.sendMessage).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("calls a tool through the route with the view's server, an absent arguments as {}", async () => {
    const fixture = connected();

    request(fixture, 3, "tools/call", { name: "forecast" });
    await settled();

    expect(fixture.services.route).toHaveBeenCalledWith({
      serverId: "weather",
      method: "tools/call",
      params: { name: "forecast", arguments: {} },
    });
    expect(fixture.posted).toEqual([{ jsonrpc: "2.0", id: 3, result: { content: [] } }]);
  });

  it("refuses a tools/call with no tool name", async () => {
    const fixture = connected();

    request(fixture, 3, "tools/call", { arguments: {} });
    await settled();

    expect(fixture.posted[0]).toMatchObject({ id: 3, error: { code: -32602 } });
  });

  it("answers a failed tool call with the route's error", async () => {
    const fixture = connected();
    vi.mocked(fixture.services.route).mockRejectedValueOnce(new Error("the route answered 403"));

    request(fixture, 3, "tools/call", { name: "forecast" });
    await settled();

    expect(fixture.posted[0]).toEqual({
      jsonrpc: "2.0",
      id: 3,
      error: { code: -32000, message: "the route answered 403" },
    });
  });

  it("answers a tool call django-ag-ui refuses with the route's own JSON-RPC code", async () => {
    const fixture = connected();
    // django-ag-ui's refusal, as docs/mcp-apps.md "The answer" documents it: 200, a coded error.
    const refusal = { error: { code: -32602, message: "Tool forecast is not available to apps" } };
    const post = vi.fn(async () => new Response(JSON.stringify(refusal)));
    vi.mocked(fixture.services.route).mockImplementationOnce(serverRoute({ request: post }, "/r/"));

    request(fixture, 3, "tools/call", { name: "forecast" });
    await settled();

    expect(fixture.posted[0]).toEqual({ jsonrpc: "2.0", id: 3, error: refusal.error });
  });

  it("answers -32000 for a failure whose numeric code is not the route's", async () => {
    const fixture = connected();
    // A browser's AbortError carries code 20; happy-dom's DOMException has none.
    const aborted = new DOMException("The operation was aborted.", "AbortError");
    Object.defineProperty(aborted, "code", { value: 20 });
    vi.mocked(fixture.services.route).mockRejectedValueOnce(aborted);

    request(fixture, 3, "tools/call", { name: "forecast" });
    await settled();

    expect(fixture.posted[0]).toMatchObject({ id: 3, error: { code: -32000 } });
  });

  it("answers a failure that is not an Error with its text", async () => {
    const fixture = connected();
    fixture.host.sendMessage.mockRejectedValueOnce("offline");

    request(fixture, 5, "ui/message", { content: { type: "text", text: "hi" } });
    await settled();

    expect(fixture.posted[0]).toMatchObject({ error: { message: "offline" } });
  });

  it("sends a ui/message's text blocks, as an array or one block", async () => {
    const fixture = connected();

    request(fixture, 5, "ui/message", {
      role: "user",
      content: [
        { type: "text", text: "one" },
        { type: "image", data: "", mimeType: "image/png" },
        "stray",
        { type: "text", text: "two" },
      ],
    });
    request(fixture, 6, "ui/message", { role: "user", content: { type: "text", text: "three" } });
    await settled();

    expect(fixture.host.sendMessage.mock.calls).toEqual([["one\n\ntwo"], ["three"]]);
    expect(fixture.posted.map((message) => message["result"])).toEqual([{}, {}]);
  });

  it("answers isError for a ui/message with no text, or one the chat did not send", async () => {
    const fixture = connected();
    fixture.host.sendMessage.mockResolvedValueOnce(false);

    request(fixture, 5, "ui/message", { content: [{ type: "image" }] });
    request(fixture, 6, "ui/message", { content: [{ type: "text", text: "busy" }] });
    await settled();

    expect(fixture.host.sendMessage.mock.calls).toEqual([["busy"]]);
    expect(fixture.posted.map((message) => message["result"])).toEqual([
      { isError: true },
      { isError: true },
    ]);
  });

  it("opens a safe link in a noopener tab, and answers isError for an unsafe one", async () => {
    const fixture = connected();
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    request(fixture, 7, "ui/open-link", { url: "https://example.com/a" });
    request(fixture, 8, "ui/open-link", { url: "javascript:alert(1)" });
    await settled();

    expect(open.mock.calls).toEqual([["https://example.com/a", "_blank", "noopener,noreferrer"]]);
    expect(fixture.posted.map((message) => message["result"])).toEqual([{}, { isError: true }]);
  });

  it("tears down a view that asks, once it answers, then closes it", async () => {
    const fixture = connected();
    initialised(fixture);

    notify(fixture, "ui/notifications/request-teardown");
    const teardown = fixture.posted[0];
    expect(teardown).toMatchObject({ method: "ui/resource-teardown", params: {} });
    expect(fixture.close).not.toHaveBeenCalled();
    receive(fixture, { jsonrpc: "2.0", id: teardown?.["id"], result: {} });
    await settled();

    expect(fixture.close).toHaveBeenCalledTimes(1);
    fixture.disconnect();
    expect(fixture.posted).toHaveLength(1);
  });

  it.each([
    ["tools/call", { name: "forecast" }],
    ["ui/message", { content: { type: "text", text: "hi" } }],
    ["ui/open-link", { url: "https://example.com/" }],
  ])("refuses %s from a view that asked to be torn down", async (method, params) => {
    const fixture = connected();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    initialised(fixture);
    notify(fixture, "ui/notifications/request-teardown");
    fixture.posted.length = 0;

    request(fixture, 4, method, params);
    await settled();

    expect(fixture.posted[0]).toMatchObject({ id: 4, error: { code: -32000 } });
    expect(fixture.services.route).not.toHaveBeenCalled();
    expect(fixture.host.sendMessage).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("closes a view that never answers its teardown after a wait", async () => {
    vi.useFakeTimers();
    const fixture = connected();
    initialised(fixture);

    notify(fixture, "ui/notifications/request-teardown");
    await vi.advanceTimersByTimeAsync(2999);
    expect(fixture.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(fixture.close).toHaveBeenCalledTimes(1);
  });

  it("ignores a teardown request from a view that has not initialised", () => {
    const fixture = connected();

    notify(fixture, "ui/notifications/request-teardown");

    expect(fixture.posted).toEqual([]);
  });

  it("sends ui/resource-teardown when stopped while an initialised view is still in place", () => {
    const fixture = connected();
    initialised(fixture);

    fixture.disconnect();

    expect(fixture.posted).toEqual([
      { jsonrpc: "2.0", id: "teardown", method: "ui/resource-teardown", params: {} },
    ]);
  });

  it("sends nothing when stopped before initialised or after the frame left", () => {
    const early = connected();
    early.disconnect();
    const gone = connected();
    initialised(gone);
    gone.channel.iframe.remove();
    gone.disconnect();

    expect(early.posted).toEqual([]);
    expect(gone.posted).toEqual([]);
  });

  it("stops reading messages once stopped", () => {
    const fixture = connected();
    fixture.disconnect();

    request(fixture, 1, "ui/initialize");

    expect(fixture.posted).toEqual([]);
  });
});

describe("what the bridge reads of <ag-ui-chat>", () => {
  it("reads the locale from the nearest lang, else the browser's", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    document.body.append(el);
    expect(el.locale).toBe(navigator.language);

    const wrapper = document.createElement("div");
    wrapper.lang = "de-AT";
    wrapper.append(el);
    document.body.append(wrapper);
    expect(el.locale).toBe("de-AT");
  });

  it("reads the locale from a lang outside the shadow root the chat is drawn in", () => {
    const page = document.createElement("div");
    page.lang = "de";
    const app = document.createElement("div");
    const root = app.attachShadow({ mode: "open" });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    root.append(el);
    page.append(app);
    document.body.append(page);

    expect(el.locale).toBe("de");
  });

  it("keeps the browser's language for an empty lang nearest the chat", () => {
    const page = document.createElement("div");
    page.lang = "de";
    const app = document.createElement("div");
    app.setAttribute("lang", "");
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    app.attachShadow({ mode: "open" }).append(el);
    page.append(app);
    document.body.append(page);

    expect(el.locale).toBe(navigator.language);
  });

  it("fires ag-ui-theme with the drawn scheme when the theme attribute changes", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    document.body.append(el);
    const heard: unknown[] = [];
    el.addEventListener(THEME_EVENT, (event) => heard.push((event as CustomEvent).detail));

    el.setAttribute("theme", "soft dark");

    expect(heard).toEqual([{ scheme: "dark" }]);
    expect(el.colorScheme).toBe("dark");
  });

  it("leaves out a custom property the panel does not declare", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    document.body.append(el);

    expect(el.tokenValues(["--_no-such-token"])).toEqual({});
    expect(el.shadowRoot?.querySelector(":scope > span")).toBeNull();
  });
});
