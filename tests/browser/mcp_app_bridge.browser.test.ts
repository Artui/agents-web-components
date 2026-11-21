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

/** Answers the consent card the view's request raised beside its frame. */
async function answer(el: HTMLElement, allow = true): Promise<void> {
  const button = await until(
    () =>
      (el.shadowRoot as ShadowRoot).querySelector<HTMLButtonElement>(
        `.mcp-app-view-stage .mcp-app-consent .confirm-btn--${allow ? "confirm" : "cancel"}`,
      ) ?? undefined,
    "the consent card",
  );
  button.click();
}

/**
 * Waits for the consent card, then asserts it is laid out where the user can
 * answer it: inside its stage and the viewport, each button inside the card,
 * and the confirm button the element hit at its own centre.
 */
async function consentCard(el: AgUiChat): Promise<HTMLElement> {
  const root = el.shadowRoot as ShadowRoot;
  const card = await until(
    () => root.querySelector<HTMLElement>(".mcp-app-view-stage > .mcp-app-consent") ?? undefined,
    "the consent card",
  );
  const box = card.getBoundingClientRect();
  const stage = (card.parentElement as HTMLElement).getBoundingClientRect();
  expect(box.width).toBeGreaterThan(0);
  expect(box.left).toBeGreaterThanOrEqual(stage.left);
  expect(box.right).toBeLessThanOrEqual(stage.right);
  expect(box.bottom).toBeLessThanOrEqual(Math.min(stage.bottom, window.innerHeight) + 0.5);
  for (const button of card.querySelectorAll<HTMLButtonElement>(".confirm-btn")) {
    const rect = button.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(box.left);
    expect(rect.right).toBeLessThanOrEqual(box.right);
    expect(rect.bottom).toBeLessThanOrEqual(box.bottom);
  }
  const confirm = card.querySelector(".confirm-btn--confirm") as HTMLButtonElement;
  const at = confirm.getBoundingClientRect();
  expect(root.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2)).toBe(confirm);
  expect(getComputedStyle(card).borderTopStyle).toBe("solid");
  return card;
}

function reports(kind: string): Received[] {
  return received.filter((entry) => entry.data?.["kind"] === kind);
}

function report(kind: string, match: (data: unknown) => boolean = () => true): Promise<unknown> {
  return until(() => reports(kind).find((entry) => match(entry.data["data"]))?.data["data"], kind);
}

/** Each host-context-changed the view was told that names its display mode. */
function displayChanges(): Record<string, unknown>[] {
  return reports("context")
    .map((entry) => entry.data["data"] as Record<string, unknown>)
    .filter((context) => "displayMode" in context)
    .slice(1);
}

/** How many times the view has sent ui/initialize: once per window it boots in. */
function initializes(): number {
  return reports("got").filter((entry) => (entry.data["data"] as { id?: unknown }).id === 1).length;
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
async function drawn(
  attributes: Readonly<Record<string, string>> = {},
  call: unknown = { result: CALL_RESULT },
): Promise<Drawn> {
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
    // django-ag-ui's answer (docs/mcp-apps.md, "The answer"): { result } or a coded { error }.
    const body = JSON.parse(String(init?.body));
    const answer =
      body.method === "resources/read"
        ? {
            result: {
              contents: [{ uri: URI, mimeType: "text/html;profile=mcp-app", text: viewHtml() }],
            },
          }
        : call;
    return new Response(JSON.stringify(answer));
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
      availableDisplayModes: ["inline", "fullscreen"],
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
    const { el, act, request } = await drawn();

    act("callTool", "forecast", { day: "monday" });
    await answer(el);
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

  it("gives the view the route's own JSON-RPC code when django-ag-ui refuses a tool call", async () => {
    const refusal = { code: -32602, message: "Tool forecast is not available to apps" };
    const { el, act } = await drawn({}, { error: refusal });

    act("callTool", "forecast", {});
    await answer(el);
    const done = (await report("done")) as Record<string, unknown>;

    expect(done["error"]).toEqual(refusal);
  });

  it("sends a ui/message as the chat's own message", async () => {
    const { el, act } = await drawn();
    const send = vi.spyOn(el, "sendMessage").mockResolvedValue(true);

    act("sendMessage", "and tomorrow?");
    await answer(el);
    const done = (await report("done")) as Record<string, unknown>;

    expect(send).toHaveBeenCalledWith("and tomorrow?");
    expect(done["result"]).toEqual({});
  });

  it("answers the view's own bridge with the denial when the user declines a ui/message", async () => {
    const { el, act } = await drawn();
    const send = vi.spyOn(el, "sendMessage").mockResolvedValue(true);

    act("sendMessage", "and tomorrow?");
    await answer(el, false);
    const done = (await report("done")) as Record<string, unknown>;

    expect(send).not.toHaveBeenCalled();
    expect(done["error"]).toMatchObject({ code: -32000, message: "Message sending denied" });
  });

  it("lays the consent card out under the frame in a narrow inline chat", async () => {
    const { el, act, frame } = await drawn();
    (el.parentElement as HTMLElement).style.width = "240px";

    act("callTool", "forecast", { day: "monday", hours: [6, 12, 18] });
    const card = await consentCard(el);

    expect(card.getBoundingClientRect().top - frame.getBoundingClientRect().bottom).toBe(8);
    expect(document.activeElement).not.toBe(el);
    await answer(el);
    expect(((await report("done")) as Record<string, unknown>)["result"]).toEqual(CALL_RESULT);
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

  it("answers pip with the mode the view is in, switching nothing", async () => {
    const { act } = await drawn();

    act("requestDisplayMode", "pip");

    expect(((await report("done")) as Record<string, unknown>)["result"]).toEqual({
      mode: "inline",
    });
    expect(displayChanges()).toHaveLength(0);
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

describe("fullscreen, against django-spec-mcp's view bridge", () => {
  /** Asks for fullscreen and waits for both the answer and the context it is told. */
  async function fullscreen(drawnView: Drawn): Promise<Record<string, unknown>> {
    drawnView.act("requestDisplayMode", "fullscreen");
    const done = (await report("done")) as Record<string, unknown>;
    await until(() => (displayChanges().length > 0 ? true : undefined), "the fullscreen context");
    return done;
  }

  function stageOf(frame: HTMLIFrameElement): HTMLElement {
    return frame.parentElement as HTMLElement;
  }

  it("pins the consent card under the frame in the fullscreen sheet, where it can be answered", async () => {
    const drawnView = await drawn();
    await fullscreen(drawnView);

    drawnView.act("sendMessage", "and tomorrow?");
    const card = await consentCard(drawnView.el);

    expect(drawnView.frame.getBoundingClientRect().height).toBeGreaterThan(100);
    const box = card.getBoundingClientRect();
    expect(box.top - drawnView.frame.getBoundingClientRect().bottom).toBe(8);
    expect([box.left, window.innerWidth - box.right, window.innerHeight - box.bottom]).toEqual([
      8, 8, 8,
    ]);
    expect(card.querySelector(".confirm-args")?.textContent).toBe("and tomorrow?");
  });

  it("shows the view over the page in the same frame, and tells it its mode and box", async () => {
    const drawnView = await drawn();
    const { frame } = drawnView;
    const before = frame.contentWindow;
    const inlineHeight = frame.style.height;

    const done = await fullscreen(drawnView);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(done["result"]).toEqual({ mode: "fullscreen" });
    const rect = stageOf(frame).getBoundingClientRect();
    expect([rect.left, rect.top, rect.width, rect.height]).toEqual([
      0,
      0,
      window.innerWidth,
      window.innerHeight,
    ]);
    expect(frame.getBoundingClientRect().width).toBe(window.innerWidth);
    expect(frame.clientHeight).toBeGreaterThan(window.innerHeight - 80);
    expect(displayChanges()).toEqual([
      expect.objectContaining({
        displayMode: "fullscreen",
        containerDimensions: { width: frame.clientWidth, height: frame.clientHeight },
      }),
    ]);
    expect(frame.contentWindow === before).toBe(true);
    expect(frame.style.height).toBe(inlineHeight);
    expect(initializes()).toBe(1);
  });

  it("returns inline on Escape, focused on its close control, with the height it had", async () => {
    const drawnView = await drawn();
    const { el, frame } = drawnView;
    await until(() => (frame.style.height === "120px" ? true : undefined), "the view's height");
    await fullscreen(drawnView);
    const exit = stageOf(frame).querySelector(".mcp-app-view-exit") as HTMLButtonElement;
    expect((el.shadowRoot as ShadowRoot).activeElement).toBe(exit);
    expect(getComputedStyle(exit).display).toBe("block");
    const collapse = vi.fn();
    el.shadowRoot?.addEventListener("keydown", collapse);

    exit.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await until(() => (displayChanges().length > 1 ? true : undefined), "the inline context");

    expect(collapse).not.toHaveBeenCalled();
    expect(displayChanges()[1]).toMatchObject({
      displayMode: "inline",
      containerDimensions: { width: frame.clientWidth, maxHeight: MCP_APP_MAX_HEIGHT },
    });
    expect(stageOf(frame).getBoundingClientRect().width).toBeLessThan(window.innerWidth);
    expect(frame.getBoundingClientRect().height).toBe(120);
    expect(getComputedStyle(exit).display).toBe("none");
    expect(initializes()).toBe(1);
  });

  it("returns inline from its close control, or when the view asks", async () => {
    const drawnView = await drawn();
    const { frame } = drawnView;
    await fullscreen(drawnView);

    (stageOf(frame).querySelector(".mcp-app-view-exit") as HTMLButtonElement).click();
    await until(() => (displayChanges().length > 1 ? true : undefined), "the inline context");
    expect(displayChanges()[1]?.["displayMode"]).toBe("inline");

    await fullscreen(drawnView);
    drawnView.act("requestDisplayMode", "inline");
    await until(() => (reports("done").length > 2 ? true : undefined), "the third answer");
    expect(reports("done")[2]?.data["data"]).toMatchObject({ result: { mode: "inline" } });
    expect(stageOf(frame).dataset["displayMode"]).toBeUndefined();
    expect(stageOf(frame).hasAttribute("popover")).toBe(false);
  });

  it("covers the viewport from a floating panel, above the chat's own layers", async () => {
    const drawnView = await drawn({ placement: "floating" });
    drawnView.el.toggleCollapsed();
    const chat = (drawnView.el.shadowRoot as ShadowRoot).querySelector(".chat") as HTMLElement;
    await until(() => (getComputedStyle(chat).transform === "none" ? true : undefined), "open");
    await fullscreen(drawnView);
    const stage = stageOf(drawnView.frame);

    const rect = stage.getBoundingClientRect();
    expect([rect.width, rect.height]).toEqual([window.innerWidth, window.innerHeight]);
    const hit = (drawnView.el.shadowRoot as ShadowRoot).elementFromPoint(
      window.innerWidth / 2,
      window.innerHeight - 4,
    );
    expect(hit === drawnView.frame || stage.contains(hit)).toBe(true);
  });

  it("covers the page above a host page layer that outranks the chat's z-index", async () => {
    const drawnView = await drawn({ style: "--ag-ui-z-index: 5" });
    const nav = document.createElement("nav");
    Object.assign(nav.style, {
      position: "fixed",
      inset: "0 auto 0 0",
      width: "200px",
      zIndex: "20",
    });
    document.body.append(nav);
    expect(document.elementFromPoint(100, 300)).toBe(nav);

    await fullscreen(drawnView);

    expect(stageOf(drawnView.frame).matches(":popover-open")).toBe(true);
    expect(document.elementFromPoint(100, 300)).toBe(drawnView.el);
  });

  it("covers the viewport from the sidebar placement, which contains its layout", async () => {
    const drawnView = await drawn({ placement: "sidebar" });
    const chat = (drawnView.el.shadowRoot as ShadowRoot).querySelector(".chat") as HTMLElement;
    await until(() => (getComputedStyle(chat).transform === "none" ? true : undefined), "open");

    await fullscreen(drawnView);

    const rect = stageOf(drawnView.frame).getBoundingClientRect();
    expect([rect.left, rect.top, rect.width, rect.height]).toEqual([
      0,
      0,
      window.innerWidth,
      window.innerHeight,
    ]);
  });

  it("tears down a fullscreen view to an inline notice", async () => {
    const drawnView = await drawn();
    const { el, frame } = drawnView;
    await fullscreen(drawnView);
    const node = stageOf(frame).parentElement as HTMLElement;

    drawnView.act("raw", {
      jsonrpc: "2.0",
      method: "ui/notifications/request-teardown",
      params: {},
    });
    await until(() => (frame.isConnected ? undefined : true), "the frame to go");

    expect(node.querySelector(".run-notice")).not.toBeNull();
    expect(node.style.minHeight).toBe("");
    const reached = vi.fn();
    el.shadowRoot?.addEventListener("keydown", reached);
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(reached).toHaveBeenCalledTimes(1);
  });
});
