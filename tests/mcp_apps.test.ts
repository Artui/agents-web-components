import { afterEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { ActivityRegistration } from "../src/core/activity_registration.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { registerMcpApps } from "../src/mcp_apps.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
import { FakeIntersectionObserver } from "./helpers/fake_intersection.js";

defineChat();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const CONTENT = { resourceUri: "ui://a/v.html", toolInput: {}, result: { content: [] } };

async function drawnNotice(content: Record<string, unknown>): Promise<string | null | undefined> {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-strings", JSON.stringify({ mcpAppUnsupported: "Keine Ansicht: {uri}" }));
  el.agentFactory = () =>
    makeFakeAgent({ script: (emit: Emit) => emit.activity("mcp-apps", content, "a1") }).agent;
  registerMcpApps(el, { url: "/agent/mcp-apps/" });
  document.body.appendChild(el);
  const root = el.shadowRoot as ShadowRoot;
  const input = root.querySelector(".input") as HTMLTextAreaElement;
  input.value = "hi";
  (root.querySelector(".send") as HTMLButtonElement).click();
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
  return root.querySelector(".run-notice--mcp-app .run-notice-text")?.textContent;
}

const VIEW = {
  resourceUri: "ui://weather/view.html",
  toolInput: {},
  result: { content: [] },
  serverId: "weather",
};

function resourceResponse(): Response {
  return new Response(
    JSON.stringify({ result: { contents: [{ uri: VIEW.resourceUri, text: "<p>forecast</p>" }] } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function settledFrame(node: HTMLElement): Promise<HTMLIFrameElement> {
  for (let i = 0; i < 20 && node.querySelector("iframe") === null; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const frame = node.querySelector("iframe");
  if (frame === null) {
    throw new Error(`expected a frame, found ${node.outerHTML}`);
  }
  return frame;
}

function registered(chat: AgUiChat): ActivityRegistration {
  const spy = vi.mocked(chat.registerActivityRenderer);
  const registration = spy.mock.calls[0]?.[0];
  if (registration === undefined) {
    throw new Error("expected a registration");
  }
  return registration;
}

describe("registerMcpApps", () => {
  it("registers the mcp-apps renderer on an <ag-ui-chat>", () => {
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    vi.spyOn(chat, "registerActivityRenderer");

    registerMcpApps(chat, { url: "/agent/mcp-apps/" });

    expect(registered(chat).type).toBe("mcp-apps");
  });

  it("draws a view node that reads nothing until it scrolls into view", () => {
    FakeIntersectionObserver.install();
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    vi.spyOn(chat, "registerActivityRenderer");
    const request = vi.spyOn(chat, "request");
    registerMcpApps(chat, { url: "/agent/mcp-apps/" });

    const node = registered(chat).render(VIEW, {
      messageId: "m1",
      previous: null,
      live: true,
    }) as HTMLElement;

    expect(node.className).toBe("mcp-app-view");
    expect(request).not.toHaveBeenCalled();
  });

  it("reads the view's resource from options.url once it is in view, and frames it", async () => {
    FakeIntersectionObserver.install();
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    vi.spyOn(chat, "registerActivityRenderer");
    const request = vi.spyOn(chat, "request").mockResolvedValue(resourceResponse());
    registerMcpApps(chat, { url: "/agent/mcp-apps/" });
    const node = registered(chat).render(VIEW, {
      messageId: "m1",
      previous: null,
      live: true,
    }) as HTMLElement;
    document.body.append(node);

    FakeIntersectionObserver.show(node);
    const frame = await settledFrame(node);

    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/agent/mcp-apps/");
    expect(JSON.parse(init.body as string)).toEqual({
      serverId: "weather",
      method: "resources/read",
      params: { uri: "ui://weather/view.html" },
    });
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.srcdoc).toContain("<p>forecast</p>");
  });

  it("frames the view through options.sandboxProxyUrl when the host configures one", async () => {
    FakeIntersectionObserver.install();
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    vi.spyOn(chat, "registerActivityRenderer");
    vi.spyOn(chat, "request").mockResolvedValue(resourceResponse());
    registerMcpApps(chat, {
      url: "/agent/mcp-apps/",
      sandboxProxyUrl: "https://sandbox.example/proxy.html",
    });
    const node = registered(chat).render(VIEW, {
      messageId: "m1",
      previous: null,
      live: true,
    }) as HTMLElement;
    document.body.append(node);

    FakeIntersectionObserver.show(node);
    const frame = await settledFrame(node);

    expect(frame.getAttribute("src")).toMatch(/^https:\/\/sandbox\.example\/proxy\.html\?csp=/);
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(frame.hasAttribute("srcdoc")).toBe(false);
  });

  it("refuses a sandbox proxy on the page's own origin, which would be no sandbox", () => {
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    const register = vi.spyOn(chat, "registerActivityRenderer");

    expect(() =>
      registerMcpApps(chat, {
        url: "/agent/mcp-apps/",
        sandboxProxyUrl: new URL("/proxy.html", window.location.href).href,
      }),
    ).toThrow(/another origin/);
    expect(register).not.toHaveBeenCalled();
  });

  it("draws the notice in the words of data-strings when the activity names no server", async () => {
    await expect(drawnNotice(CONTENT)).resolves.toBe("Keine Ansicht: ui://a/v.html");
  });
});
