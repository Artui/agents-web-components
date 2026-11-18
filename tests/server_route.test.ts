import { describe, expect, it, vi } from "vitest";
import { MCP_APPS_ROUTE_ERROR } from "../src/constants.js";
import { serverRoute } from "../src/mcp_apps/server_route.js";

function host(response: Response) {
  return { request: vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(response)) };
}

/**
 * django-ag-ui's answer, as its docs/mcp-apps.md "The answer" documents it: a
 * relayed call is `{"result": ...}` at 200, anything it cannot relay
 * `{"error": {"code", "message"}}` at 200 with a JSON-RPC code.
 */
function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const READ = {
  serverId: "weather",
  method: "resources/read",
  params: { uri: "ui://weather/view.html" },
} as const;

describe("serverRoute", () => {
  it("POSTs the request as JSON through chat.request and resolves to the result", async () => {
    const chat = host(answer({ result: { contents: [] } }));

    await expect(serverRoute(chat, "/agent/mcp-apps/")(READ)).resolves.toEqual({ contents: [] });

    const [url, init] = chat.request.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/agent/mcp-apps/");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual(READ);
  });

  it("resolves a tool result with isError to that result, which django-ag-ui still relays", async () => {
    const failed = { content: [{ type: "text", text: "denied by policy" }], isError: true };
    const chat = host(answer({ result: failed }));

    await expect(serverRoute(chat, "/r/")(READ)).resolves.toEqual(failed);
  });

  it.each([[-32700], [-32602], [-32601]])(
    "rejects django-ag-ui's coded error at 200 with its code %i and message",
    async (code) => {
      const chat = host(answer({ error: { code, message: "Unknown resource: ui://nope" } }));

      const error = await serverRoute(chat, "/r/")(READ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({
        name: MCP_APPS_ROUTE_ERROR,
        code,
        message: "Unknown resource: ui://nope",
      });
    },
  );

  it("rejects a refused request with its status", async () => {
    const chat = host(new Response("no", { status: 403 }));

    await expect(serverRoute(chat, "/r/")(READ)).rejects.toThrow("resources/read with 403");
  });

  it.each([
    ["null"],
    ["[]"],
    ['"text"'],
    ['{"contents": []}'],
    ['{"result": null}'],
    ['{"result": []}'],
    ['{"error": {"message": "no code"}}'],
    ['{"error": {"code": 1.5, "message": "m"}}'],
    ['{"error": {"code": -32602}}'],
  ])("rejects a body that is neither a result nor a coded error: %s", async (body) => {
    const chat = host(new Response(body));

    await expect(serverRoute(chat, "/r/")(READ)).rejects.toThrow("no result object");
  });
});
