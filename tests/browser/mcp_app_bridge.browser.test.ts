import { afterEach, beforeAll, describe, expect, it, type MockInstance, vi } from "vitest";
import { ELEMENT_TAG, MCP_APP_MAX_HEIGHT } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { registerMcpApps } from "../../src/mcp_apps.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * The host bridge against django-spec-mcp's own view bridge, in a real frame:
 * the handshake, what crosses it and when are what is at stake, and happy-dom
 * loads no frame.
 */

const URI = "ui://weather/view.html";
const ROUTE = "/agent/mcp-apps/";
const TOOL_INPUT = { city: "Oslo" };
const TOOL_RESULT = { content: [{ type: "text", text: "4 C" }], structuredContent: { temp: 4 } };
const CALL_RESULT = { content: [{ type: "text", text: "5 C" }], structuredContent: { temp: 5 } };

/** The view: django-spec-mcp's bridge, and a script that reports to this page. */
const VIEW_SCRIPT = `
  const report = (kind, data) =>
    parent.postMessage({ kind, data: JSON.parse(JSON.stringify(data ?? null)) }, "*");
  addEventListener("message", (event) => {
    const data = event.data;
    if (data && data.jsonrpc === "2.0") {
      report("got", { method: data.method ?? null, id: data.id ?? null });
    }
  });
  addEventListener("message", async (event) => {
    const data = event.data;
    if (!data || data.kind !== "do") return;
    if (data.what === "grow") {
      document.getElementById("mcp-app-root").style.height = data.args[0] + "px";
      return;
    }
    if (data.what === "raw") {
      parent.postMessage(data.args[0], "*");
      return;
    }
    try {
      report("done", { what: data.what, result: await mcpApp[data.what](...data.args) });
    } catch (error) {
      report("done", { what: data.what, error });
    }
  });
  mcpApp.onToolInput = (args) => report("input", args);
  mcpApp.onToolResult = (structured, result) => report("result", result);
  mcpApp.onHostContext = (context) => report("context", context);
  mcpApp.onTeardown = () => report("teardown");
`;

interface Received {
  readonly source: MessageEventSource | null;
  readonly data: Readonly<Record<string, unknown>>;
}

let received: Received[] = [];
let bridge = "";
const collect = (event: MessageEvent): void => {
  received.push({ source: event.source, data: event.data });
};

beforeAll(async () => {
  defineChat();
  window.addEventListener("message", collect);
  bridge = await (await fetch("/tests/browser/fixtures/spec_mcp_bridge.js")).text();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  received = [];
});

async function until<T>(read: () => T | undefined, what: string): Promise<T> {
  for (let i = 0; i < 150; i += 1) {
    const value = read();
    if (value !== undefined) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for ${what}`);
}

function reports(kind: string): Received[] {
  return received.filter((entry) => entry.data?.["kind"] === kind);
}

function report(kind: string, match: (data: unknown) => boolean = () => true): Promise<unknown> {
  return until(() => reports(kind).find((entry) => match(entry.data["data"]))?.data["data"], kind);
}

function viewHtml(): string {
  return `<!doctype html><html><head><script>${bridge}</script><script>${VIEW_SCRIPT}</script></head>
    <body style="margin:0"><div id="mcp-app-root" style="height:120px">weather</div></body></html>`;
}

interface Drawn {
  readonly el: AgUiChat;
  readonly frame: HTMLIFrameElement;
  readonly request: MockInstance<AgUiChat["request"]>;
  act(what: string, ...args: unknown[]): void;
}

/** An `<ag-ui-chat>` whose run draws one view, once that view has its tool result. */
async function drawn(attributes: Readonly<Record<string, string>> = {}): Promise<Drawn> {
  const box = document.createElement("div");
  box.style.width = "600px";
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  el.agentFactory = () =>
    makeFakeAgent({
      script: (emit: Emit) =>
        emit.activity(
          "mcp-apps",
          { resourceUri: URI, toolInput: TOOL_INPUT, result: TOOL_RESULT, serverId: "weather" },
          "a1",
        ),
    }).agent;
  const request = vi.spyOn(el, "request").mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const result =
      body.method === "resources/read"
        ? { contents: [{ uri: URI, mimeType: "text/html;profile=mcp-app", text: viewHtml() }] }
        : CALL_RESULT;
    return new Response(JSON.stringify(result));
  });
  registerMcpApps(el, { url: ROUTE });
  box.append(el);
  document.body.append(box);
  void el.sendMessage("weather in Oslo");
  await report("result");
  const frame = (el.shadowRoot as ShadowRoot).querySelector(
    ".mcp-app-view iframe",
  ) as HTMLIFrameElement;
  return {
    el,
    frame,
    request,
    act: (what, ...args) => frame.contentWindow?.postMessage({ kind: "do", what, args }, "*"),
  };
}

describe("the host bridge, against django-spec-mcp's view bridge", () => {
  it("answers ui/initialize, then sends the tool input and result once the view is initialised", async () => {
    const { frame } = await drawn({ theme: "dark", lang: "fr-CA" });

    const got = reports("got").map((entry) => entry.data["data"]);
    expect(got).toEqual([
      { method: null, id: 1 },
      { method: "ui/notifications/tool-input", id: null },
      { method: "ui/notifications/tool-result", id: null },
    ]);
    expect(reports("got")[0]?.source).toBe(frame.contentWindow);
    expect(await report("input")).toEqual(TOOL_INPUT);
    expect(await report("result")).toEqual(TOOL_RESULT);
    const context = (await report("context")) as Record<string, unknown>;
    expect(context).toMatchObject({
      theme: "dark",
      locale: "fr-CA",
      displayMode: "inline",
      availableDisplayModes: ["inline"],
      platform: "web",
      containerDimensions: { width: frame.clientWidth, maxHeight: MCP_APP_MAX_HEIGHT },
    });
    const variables = (context["styles"] as { variables: Record<string, string> }).variables;
    expect(variables["--color-background-primary"]).toBe("rgb(22, 22, 24)");
    expect(variables["--color-text-primary"]).toBe("rgb(236, 236, 238)");
    expect(variables["--font-sans"]).toContain("Inter");
    expect(variables["--border-radius-md"]).toBe("12px");
  });

  it("calls a tool through the route, with the element's request", async () => {
    const { act, request } = await drawn();

    act("callTool", "forecast", { day: "monday" });
    const done = (await report("done")) as Record<string, unknown>;

    expect(done["result"]).toEqual(CALL_RESULT);
    const call = request.mock.calls.find(([, init]) => String(init?.body).includes("tools/call"));
    expect(call?.[0]).toBe(ROUTE);
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      serverId: "weather",
      method: "tools/call",
      params: { name: "forecast", arguments: { day: "monday" } },
    });
  });

  it("sends a ui/message as the chat's own message", async () => {
    const { el, act } = await drawn();
    const send = vi.spyOn(el, "sendMessage").mockResolvedValue(true);

    act("sendMessage", "and tomorrow?");
    const done = (await report("done")) as Record<string, unknown>;

    expect(send).toHaveBeenCalledWith("and tomorrow?");
    expect(done["result"]).toEqual({});
  });

  it("opens an http(s) link in a noopener tab and refuses any other", async () => {
    const { act } = await drawn();
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    act("openLink", "https://example.com/forecast");
    const opened = (await report("done")) as Record<string, unknown>;
    act("openLink", "javascript:alert(1)");
    await until(() => (reports("done").length > 1 ? true : undefined), "the second answer");
    const refused = reports("done")[1]?.data["data"] as Record<string, unknown>;

    expect(opened["result"]).toEqual({});
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      "https://example.com/forecast",
      "_blank",
      "noopener,noreferrer",
    );
    expect(refused["result"]).toEqual({ isError: true });
  });

  it("answers a display mode request with inline, the only mode it shows", async () => {
    const { act } = await drawn();

    act("requestDisplayMode", "fullscreen");

    expect(((await report("done")) as Record<string, unknown>)["result"]).toEqual({
      mode: "inline",
    });
  });

  it("sizes the frame to the view's height, up to the cap", async () => {
    const { frame, act } = await drawn();

    await until(() => (frame.style.height === "120px" ? true : undefined), "the view's height");
    act("grow", 4000);
    await until(
      () => (frame.style.height === `${MCP_APP_MAX_HEIGHT}px` ? true : undefined),
      "the capped height",
    );

    expect(frame.style.height).toBe(`${MCP_APP_MAX_HEIGHT}px`);
  });

  it("tells the view when the theme changes, with the tokens of the new scheme", async () => {
    const { el } = await drawn({ theme: "dark" });

    el.setAttribute("theme", "light");
    const context = (await report(
      "context",
      (data) => (data as Record<string, unknown>)["theme"] === "light",
    )) as Record<string, unknown>;

    const variables = (context["styles"] as { variables: Record<string, string> }).variables;
    expect(variables["--color-background-primary"]).toBe("rgb(255, 255, 255)");
  });

  it("tells the view when its frame's width changes", async () => {
    const { el, frame } = await drawn();

    (el.parentElement as HTMLElement).style.width = "400px";
    const context = (await report("context", (data) => {
      const dimensions = (data as Record<string, { width?: number }>)["containerDimensions"];
      return dimensions?.width === frame.clientWidth && frame.clientWidth < 600;
    })) as Record<string, unknown>;

    expect(context["containerDimensions"]).toEqual({
      width: frame.clientWidth,
      maxHeight: MCP_APP_MAX_HEIGHT,
    });
  });

  it("sends ui/resource-teardown to a view that asks to be torn down, then closes it", async () => {
    const { el, frame, act } = await drawn();

    act("raw", { jsonrpc: "2.0", method: "ui/notifications/request-teardown", params: {} });
    await report("teardown");
    await until(() => (frame.isConnected ? undefined : true), "the frame to go");

    expect((el.shadowRoot as ShadowRoot).querySelector(".mcp-app-view .run-notice")).not.toBeNull();
  });
});
