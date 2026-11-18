import { safeUrl } from "../a2ui/safe_url.js";
import { MCP_APP_MAX_HEIGHT, THEME_EVENT } from "../constants.js";
import { VERSION } from "../version.js";
import { hostContext } from "./host_context.js";
import type { McpAppDisplayModeRequest, McpAppHostContext } from "./types.js";
import type { McpAppViewConnect } from "./view_frame.js";

/** The MCP Apps revision this host speaks (ext-apps `LATEST_PROTOCOL_VERSION`). */
const PROTOCOL_VERSION = "2026-01-26";
/** JSON-RPC's "method not found". */
const METHOD_NOT_FOUND = -32601;
/** JSON-RPC's "invalid params". */
const INVALID_PARAMS = -32602;
/** A server error: the request was understood and refused or failed. */
const REFUSED = -32000;
/** How long a view's `ui/notifications/request-teardown` waits for its teardown answer. */
const TEARDOWN_WAIT_MS = 3000;

/** What the host answers, and so all it advertises. */
const HOST_CAPABILITIES = {
  openLinks: {},
  serverTools: {},
  message: { text: {} },
} as const;

type Params = Readonly<Record<string, unknown>>;
type RequestId = string | number;

function isRecord(value: unknown): value is Params {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The text of a `ui/message`'s content: the MCP Apps schema sends an array of
 * content blocks, django-spec-mcp's bridge a single block. Only text is read.
 */
function messageText(content: unknown): string {
  const blocks: unknown[] = Array.isArray(content) ? content : [content];
  return blocks
    .flatMap((block) =>
      isRecord(block) && block["type"] === "text" && typeof block["text"] === "string"
        ? [block["text"]]
        : [],
    )
    .join("\n\n");
}

/** The keys of `next` whose value differs from `previous`'s. */
function changed(previous: McpAppHostContext, next: McpAppHostContext): Params {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(previous[key as keyof McpAppHostContext])) {
      patch[key] = value;
    }
  }
  return patch;
}

/**
 * The host's end of the MCP Apps `ui/*` bridge (2026-01-26), as the `connect`
 * a view frame calls. JSON-RPC over `postMessage`, read only from the frame's
 * current window and origin. It answers `ui/initialize` with the host context,
 * and only after `ui/notifications/initialized` sends the tool's input and
 * result, then `host-context-changed` when the scheme, the tokens or the
 * frame's width change. `size-changed` sets the frame's height, up to
 * {@link MCP_APP_MAX_HEIGHT}. `tools/call` goes to the route, `ui/message` to
 * `chat.sendMessage`, `ui/open-link` (an `http(s)` URL only) to a `noopener`
 * tab; all three are refused while the view is not live.
 * `ui/request-display-mode` is answered by `requestDisplayMode`; any other
 * request is answered `-32601`. A view that asks to be torn down is sent
 * `ui/resource-teardown` and closed once it answers.
 */
export function hostBridge(requestDisplayMode: McpAppDisplayModeRequest): McpAppViewConnect {
  return (channel, view, services) => {
    const { host } = services;
    const { iframe } = channel;
    // Both reset by each ui/initialize: a frame moved in the page reloads
    // its view, which initialises again in its new window.
    let told: McpAppHostContext | null = null;
    let initialized = false;
    let teardowns = 0;
    let tornDown = false;
    const answers = new Map<RequestId, () => void>();

    const send = (message: Params): void => channel.post({ jsonrpc: "2.0", ...message });
    const answer = (id: RequestId, result: Params): void => send({ id, result });
    const fail = (id: RequestId, code: number, message: string): void =>
      send({ id, error: { code, message } });

    const tellChanges = (): void => {
      if (!initialized || told === null) {
        return;
      }
      const next = hostContext(host, iframe);
      const patch = changed(told, next);
      told = next;
      if (Object.keys(patch).length > 0) {
        send({ method: "ui/notifications/host-context-changed", params: patch });
      }
    };

    const tearDown = (): Promise<void> => {
      teardowns += 1;
      tornDown = true;
      const id = `teardown-${teardowns}`;
      return new Promise((resolve) => {
        const timer = setTimeout(resolve, TEARDOWN_WAIT_MS);
        answers.set(id, () => {
          clearTimeout(timer);
          resolve();
        });
        send({ id, method: "ui/resource-teardown", params: {} });
      });
    };

    const act = async (id: RequestId, method: string, params: Params): Promise<void> => {
      if (method === "tools/call") {
        if (typeof params["name"] !== "string") {
          fail(id, INVALID_PARAMS, "tools/call needs a tool name");
          return;
        }
        const result = await services.route({
          serverId: view.activity.serverId,
          method: "tools/call",
          params: { name: params["name"], arguments: params["arguments"] ?? {} },
        });
        answer(id, result);
        return;
      }
      if (method === "ui/open-link") {
        const url = safeUrl(params["url"]);
        if (url === null) {
          answer(id, { isError: true });
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        answer(id, {});
        return;
      }
      const text = messageText(params["content"]);
      const sent = text !== "" && (await host.sendMessage(text));
      answer(id, sent ? {} : { isError: true });
    };

    const onRequest = (id: RequestId, method: string, params: Params): void => {
      if (method === "ui/initialize") {
        initialized = false;
        told = hostContext(host, iframe);
        answer(id, {
          protocolVersion: PROTOCOL_VERSION,
          hostInfo: { name: "agents-web-components", version: VERSION },
          hostCapabilities: HOST_CAPABILITIES,
          hostContext: told,
        });
        return;
      }
      if (method === "ui/request-display-mode") {
        answer(id, { mode: requestDisplayMode(params["mode"]) });
        return;
      }
      if (method === "tools/call" || method === "ui/open-link" || method === "ui/message") {
        if (!channel.live) {
          fail(id, REFUSED, `${method} is refused: this view is drawn from a stored conversation`);
          return;
        }
        act(id, method, params).catch((error: unknown) => fail(id, REFUSED, messageOf(error)));
        return;
      }
      fail(id, METHOD_NOT_FOUND, `this host does not implement ${method}`);
    };

    const onNotification = (method: string, params: Params): void => {
      if (method === "ui/notifications/initialized") {
        initialized = true;
        told ??= hostContext(host, iframe);
        send({
          method: "ui/notifications/tool-input",
          params: { arguments: view.activity.toolInput },
        });
        send({ method: "ui/notifications/tool-result", params: view.activity.result });
        tellChanges();
        return;
      }
      if (method === "ui/notifications/size-changed") {
        const height = params["height"];
        if (typeof height === "number" && Number.isFinite(height)) {
          const capped = Math.min(Math.max(Math.ceil(height), 0), MCP_APP_MAX_HEIGHT);
          iframe.style.height = `${capped}px`;
        }
        return;
      }
      if (method === "ui/notifications/request-teardown" && initialized) {
        void tearDown().then(() => channel.close());
      }
    };

    const onMessage = (event: MessageEvent): void => {
      if (
        event.source === null ||
        event.source !== channel.source ||
        event.origin !== channel.origin
      ) {
        return;
      }
      const data: unknown = event.data;
      if (!isRecord(data) || data["jsonrpc"] !== "2.0") {
        return;
      }
      const id = data["id"];
      const method = data["method"];
      if (typeof method !== "string") {
        // An answer to a request this host sent.
        answers.get(id as RequestId)?.();
        answers.delete(id as RequestId);
        return;
      }
      const params = isRecord(data["params"]) ? data["params"] : {};
      if (typeof id === "string" || typeof id === "number") {
        onRequest(id, method, params);
        return;
      }
      onNotification(method, params);
    };

    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const width = new ResizeObserver(tellChanges);
    window.addEventListener("message", onMessage);
    host.addEventListener(THEME_EVENT, tellChanges);
    scheme.addEventListener("change", tellChanges);
    width.observe(iframe);
    return () => {
      if (initialized && !tornDown && iframe.isConnected) {
        send({ id: "teardown", method: "ui/resource-teardown", params: {} });
      }
      window.removeEventListener("message", onMessage);
      host.removeEventListener(THEME_EVENT, tellChanges);
      scheme.removeEventListener("change", tellChanges);
      width.disconnect();
    };
  };
}
