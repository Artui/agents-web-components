import { afterEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";

defineChat();

function sent(fetchMock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init };
}

function element(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.headers = { Authorization: "Bearer static", "X-Static": "1" };
  el.getHeaders = () => ({ "X-CSRFToken": "live" });
  return el;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chat.request", () => {
  it("sends the element's headers and credentials with the request", async () => {
    const response = new Response("{}");
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const el = element();
    el.credentials = "include";

    await expect(el.request("/mcp-apps/", { method: "POST", body: "{}" })).resolves.toBe(response);

    const { url, init } = sent(fetchMock);
    expect(url).toBe("/mcp-apps/");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.credentials).toBe("include");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer static");
    expect(headers.get("X-CSRFToken")).toBe("live");
  });

  it("lets the caller's headers and credentials win", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const el = element();
    el.credentials = "include";

    await el.request("/r/", {
      headers: [
        ["x-static", "2"],
        ["Content-Type", "application/json"],
      ],
      credentials: "omit",
    });

    const { init } = sent(fetchMock);
    const headers = new Headers(init.headers);
    expect(headers.get("X-Static")).toBe("2");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Authorization")).toBe("Bearer static");
    expect(init.credentials).toBe("omit");
  });

  it("leaves credentials unset when neither the element nor the caller names a policy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await element().request("/r/");

    expect("credentials" in sent(fetchMock).init).toBe(false);
  });

  it("reports a foreign destination before the headers reach it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await element().request("https://elsewhere.example/mcp-apps/");

    const hits = warn.mock.calls.map((call) => String(call[0]));
    expect(hits.some((m) => m.includes("https://elsewhere.example"))).toBe(true);
  });
});
