import { describe, expect, it, vi } from "vitest";
import { serverRoute } from "../src/mcp_apps/server_route.js";

function host(response: Response) {
  return { request: vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response)) };
}

const READ = {
  serverId: "weather",
  method: "resources/read",
  params: { uri: "ui://weather/view.html" },
} as const;

describe("serverRoute", () => {
  it("POSTs the request as JSON through chat.request and resolves to the result", async () => {
    const chat = host(new Response(JSON.stringify({ contents: [] })));

    await expect(serverRoute(chat, "/agent/mcp-apps/")(READ)).resolves.toEqual({ contents: [] });

    const [url, init] = chat.request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/agent/mcp-apps/");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual(READ);
  });

  it("rejects a refused request with its status", async () => {
    const chat = host(new Response("no", { status: 403 }));

    await expect(serverRoute(chat, "/r/")(READ)).rejects.toThrow("resources/read with 403");
  });

  it.each([["null"], ["[]"], ['"text"']])(
    "rejects a body that is not a result object: %s",
    async (body) => {
      const chat = host(new Response(body));

      await expect(serverRoute(chat, "/r/")(READ)).rejects.toThrow("no result object");
    },
  );
});
