import { describe, expect, it, vi } from "vitest";
import { mcpAppsRenderer } from "../src/mcp_apps/mcp_apps_renderer.js";
import type { McpAppsServices, McpAppViewMount } from "../src/mcp_apps/types.js";

const CONTENT = {
  resourceUri: "ui://weather/view.html",
  toolInput: { city: "Oslo" },
  result: { content: [], structuredContent: { temp: 4 } },
  serverId: "weather",
  serverHash: "weather",
};

function services(strings: Record<string, string> = {}): McpAppsServices {
  return {
    host: {
      registerActivityRenderer: vi.fn(),
      request: vi.fn(),
      sendMessage: vi.fn(),
      strings,
    },
    route: vi.fn(),
    sandboxProxyUrl: "https://sandbox.example/proxy.html",
  };
}

function viewMount(): { mount: McpAppViewMount; calls: ReturnType<typeof vi.fn> } {
  const calls = vi.fn(() => document.createElement("div"));
  return { mount: calls as unknown as McpAppViewMount, calls };
}

describe("mcpAppsRenderer", () => {
  it("mounts a view for an activity that names its server, with no network", () => {
    const { mount, calls } = viewMount();
    const deps = services();

    const node = mcpAppsRenderer(mount, deps)(CONTENT, {
      messageId: "m1",
      previous: null,
      live: true,
    });

    expect(calls).toHaveBeenCalledTimes(1);
    expect(calls.mock.calls[0]).toEqual([{ messageId: "m1", activity: CONTENT, live: true }, deps]);
    expect(node).toBe(calls.mock.results[0]?.value);
    expect(deps.route).not.toHaveBeenCalled();
    expect(deps.host.request).not.toHaveBeenCalled();
  });

  it("passes a replay through as not live", () => {
    const { mount, calls } = viewMount();

    mcpAppsRenderer(mount, services())(CONTENT, { messageId: "m1", previous: null, live: false });

    expect(calls.mock.calls[0]?.[0]).toMatchObject({ live: false });
  });

  it("returns the node already drawn on a redraw, so its frame is not moved", () => {
    const { mount, calls } = viewMount();
    const previous = document.createElement("div");

    const node = mcpAppsRenderer(mount, services())(CONTENT, {
      messageId: "m1",
      previous,
      live: true,
    });

    expect(node).toBe(previous);
    expect(calls).not.toHaveBeenCalled();
  });

  it("draws the notice for an activity that names no server", () => {
    const { mount, calls } = viewMount();
    const { serverId: _id, serverHash: _hash, ...anonymous } = CONTENT;

    const node = mcpAppsRenderer(mount, services())(anonymous, {
      messageId: "m1",
      previous: null,
      live: true,
    }) as HTMLElement;

    expect(calls).not.toHaveBeenCalled();
    expect(node.className).toContain("run-notice--mcp-app");
    expect(node.textContent).toContain("An app view can't be shown here: ui://weather/view.html");
  });

  it("draws the notice in the host's own words", () => {
    const { mount } = viewMount();
    const { serverId: _id, ...anonymous } = CONTENT;

    const node = mcpAppsRenderer(mount, services({ mcpAppUnsupported: "Kein Fenster: {uri}" }))(
      anonymous,
      { messageId: "m1", previous: null, live: true },
    ) as HTMLElement;

    expect(node.textContent).toContain("Kein Fenster: ui://weather/view.html");
  });

  it("draws nothing for content that is not an activity", () => {
    const { mount, calls } = viewMount();

    const node = mcpAppsRenderer(mount, services())(
      { html: "<p>" },
      { messageId: "m1", previous: null, live: true },
    );

    expect(node).toBeNull();
    expect(calls).not.toHaveBeenCalled();
  });
});
