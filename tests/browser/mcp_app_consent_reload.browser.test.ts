import { afterEach, describe, expect, it, vi } from "vitest";
import { hostBridge } from "../../src/mcp_apps/host_bridge.js";
import type { McpAppsServices, McpAppView } from "../../src/mcp_apps/types.js";
import { viewFrame } from "../../src/mcp_apps/view_frame.js";
import { DEFAULT_UI_STRINGS } from "../../src/ui/ui_strings.js";

/**
 * A frame the host moves in the page reloads in a new window, which initialises
 * again: a card still waiting for the old window must not answer the new one.
 */

const URI = "ui://weather/view.html";
const HTML = `<script>
const nonce = Math.random().toString(36).slice(2, 8);
addEventListener("message", (event) => {
  const data = event.data;
  parent.postMessage({ kind: "got", nonce, data }, "*");
  if (data && data.id === 1 && data.result) {
    parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} }, "*");
    parent.postMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "call-" + nonce, arguments: {} } }, "*");
  }
});
parent.postMessage({ kind: "booted", nonce }, "*");
parent.postMessage({ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {} }, "*");
</script>`;

type Report = { kind: string; nonce: string; data?: { id?: number } };

let received: Report[] = [];
const collect = (event: MessageEvent): void => {
  received.push(event.data as Report);
};
window.addEventListener("message", collect);
afterEach(() => {
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

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const boots = (): string[] => received.filter((r) => r.kind === "booted").map((r) => r.nonce);
const gotBy = (nonce: string, id: number): Report[] =>
  received.filter((r) => r.kind === "got" && r.nonce === nonce && r.data?.id === id);

type Route = (request: { method: string; params: Record<string, unknown> }) => Promise<unknown>;

function mountView(route: Route): HTMLElement {
  const host = {
    registerActivityRenderer: vi.fn(),
    request: vi.fn(),
    sendMessage: vi.fn(async () => true),
    uiStrings: DEFAULT_UI_STRINGS,
    colorScheme: "light" as const,
    locale: "en",
    tokenValues: () => ({}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const services = {
    host,
    route,
    sandboxProxyUrl: undefined,
    views: new WeakMap(),
    resources: new Map(),
    overlay: { exit: null },
  } as unknown as McpAppsServices;
  const view: McpAppView = {
    messageId: "m1",
    activity: { resourceUri: URI, toolInput: {}, result: { content: [] }, serverId: "weather" },
    live: true,
  };
  const node = viewFrame(hostBridge())(view, services);
  document.body.append(node);
  return node;
}

describe("a consent card waiting while its frame reloads", () => {
  const setup = async (): Promise<{
    node: HTMLElement;
    first: string;
    second: string;
    stale: HTMLElement;
    calls: () => unknown[];
  }> => {
    const route: Route = vi.fn(async (request) =>
      request.method === "resources/read"
        ? { contents: [{ uri: URI, text: HTML }] }
        : { content: [{ type: "text", text: `result of ${String(request.params["name"])}` }] },
    );
    const node = mountView(route);
    const stale = await until(
      () => node.querySelector<HTMLElement>(".mcp-app-consent") ?? undefined,
      "the first card",
    );
    const [first = ""] = boots();
    document.body.append(document.createElement("div"));
    document.body.lastElementChild?.append(node);
    const second = await until(() => boots()[1], "the new window booting");
    await until(() => gotBy(second, 1)[0], "the new window initialised");
    await pause(200);
    const calls = (): unknown[] =>
      vi
        .mocked(route)
        .mock.calls.filter(([request]) => request.method === "tools/call")
        .map(([request]) => request.params["name"]);
    return { node, first, second, stale, calls };
  };

  it("drops the old window's card, and runs only the new window's call once confirmed", async () => {
    const { node, first, second, stale, calls } = await setup();

    expect(stale.isConnected).toBe(false);
    expect(node.querySelectorAll(".mcp-app-consent").length).toBe(1);
    node.querySelector<HTMLButtonElement>(".mcp-app-consent .confirm-btn--confirm")?.click();
    await pause(300);

    expect(calls()).toEqual([`call-${second}`]);
    const answers = gotBy(second, 2);
    expect(answers.length).toBe(1);
    expect(JSON.stringify(answers[0]?.data)).toContain(`call-${second}`);
    expect(JSON.stringify(answers)).not.toContain(`call-${first}`);
  });

  it("answers the new window's call once when the card left is cancelled", async () => {
    const { node, second, calls } = await setup();

    node.querySelector<HTMLButtonElement>(".mcp-app-consent .confirm-btn--cancel")?.click();
    await pause(300);

    expect(calls()).toEqual([]);
    expect(node.querySelectorAll(".mcp-app-consent").length).toBe(0);
    const answers = gotBy(second, 2);
    expect(answers.length).toBe(1);
    expect(JSON.stringify(answers[0]?.data)).toContain("-32000");
  });
});
