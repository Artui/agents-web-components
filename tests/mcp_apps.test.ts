import { afterEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { ActivityRegistration } from "../src/core/activity_registration.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { registerMcpApps } from "../src/mcp_apps.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();

afterEach(() => {
  vi.restoreAllMocks();
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

  it("draws the notice for a view until the frame exists, and fetches nothing", () => {
    const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
    vi.spyOn(chat, "registerActivityRenderer");
    const request = vi.spyOn(chat, "request");
    registerMcpApps(chat, {
      url: "/agent/mcp-apps/",
      sandboxProxyUrl: "https://sandbox.example/proxy.html",
    });

    const node = registered(chat).render(
      {
        resourceUri: "ui://weather/view.html",
        toolInput: {},
        result: { content: [] },
        serverId: "weather",
      },
      { messageId: "m1", previous: null, live: true },
    ) as HTMLElement;

    expect(node.className).toContain("run-notice--mcp-app");
    expect(node.textContent).toContain("ui://weather/view.html");
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ["names no server", CONTENT],
    ["names its server", { ...CONTENT, serverId: "weather" }],
  ])(
    "draws the notice in the words of data-strings when the activity %s",
    async (_name, content) => {
      await expect(drawnNotice(content)).resolves.toBe("Keine Ansicht: ui://a/v.html");
    },
  );
});
