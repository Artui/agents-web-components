import { afterEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { ActivityRegistration } from "../src/core/activity_registration.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { registerMcpApps } from "../src/mcp_apps.js";

defineChat();

afterEach(() => {
  vi.restoreAllMocks();
});

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
});
