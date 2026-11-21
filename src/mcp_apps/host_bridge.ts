import { safeUrl } from "../a2ui/safe_url.js";
import { MCP_APP_MAX_HEIGHT, MCP_APPS_ROUTE_ERROR, THEME_EVENT } from "../constants.js";
import { VERSION } from "../version.js";
import { hostContext } from "./host_context.js";
import type { McpAppDisplayMode, McpAppHostContext } from "./types.js";
import type { McpAppConsentRequest } from "./view_consent.js";
import type { McpAppViewConnect } from "./view_frame.js";

/** The MCP Apps revision this host speaks (ext-apps `LATEST_PROTOCOL_VERSION`). */
const PROTOCOL_VERSION = "2026-01-26";
/** JSON-RPC's "method not found". */
const METHOD_NOT_FOUND = -32601;
/** JSON-RPC's "invalid params". */
const INVALID_PARAMS = -32602;
/** A server error: the request was understood and refused or failed. */
const REFUSED = -32000;
/** The answer to a `ui/message` the user declined, as the MCP Apps specification's own example. */
const MESSAGE_DENIED = "Message sending denied";
/** The answer to a `tools/call` the user declined. */
const TOOL_CALL_DENIED = "Tool call denied";
/** How long a view's `ui/notifications/request-teardown` waits for its teardown answer. */
const TEARDOWN_WAIT_MS = 3000;

/** The modes a live view may ask for; a stored one, or one being torn down, is shown inline. */
const DISPLAY_MODES: readonly McpAppDisplayMode[] = ["inline", "fullscreen"];

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

/** The route's own JSON-RPC code for a refusal it answered, else {@link REFUSED}. */
function codeOf(error: unknown): number {
  const { name, code } = Object(error) as { readonly name?: unknown; readonly code?: number };
  return name === MCP_APPS_ROUTE_ERROR ? (code as number) : REFUSED;
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
 * `chat.sendMessage`, each only once the user allows it in a card beside the
 * view (declined, `-32000`), and `ui/open-link` (an `http(s)` URL only) to a
 * `noopener` tab; all three are refused while the view is not live, and once
 * it has asked to be torn down. `ui/request-display-mode` switches a live view
 * between `inline` and `fullscreen` through the frame's display, answers the
 * mode it is in after (the current one for `pip` or a refused request, as the
 * schema's result allows), and tells the view `displayMode` and
 * `containerDimensions` in `host-context-changed`, as it does when the user
 * returns it inline. Any other request is answered `-32601`. A view that asks
 * to be torn down is sent `ui/resource-teardown` and closed once it answers.
 */
export function hostBridge(): McpAppViewConnect {
  return (channel, view, services) => {
    const { host } = services;
    const { iframe, display } = channel;
    // Both reset by each ui/initialize: a frame moved in the page reloads
    // its view, which initialises again in its new window.
    let told: McpAppHostContext | null = null;
    let initialized = false;
    let teardowns = 0;
    let tornDown = false;
    const answers = new Map<RequestId, () => void>();
    const context = (): McpAppHostContext =>
      hostContext(
        host,
        iframe,
        display.mode,
        channel.live && !tornDown ? DISPLAY_MODES : ["inline"],
      );

    const send = (message: Params): void => channel.post({ jsonrpc: "2.0", ...message });
    const answer = (id: RequestId, result: Params): void => send({ id, result });
    const fail = (id: RequestId, code: number, message: string): void =>
      send({ id, error: { code, message } });

    const tellChanges = (): void => {
      if (!initialized || told === null) {
        return;
      }
      const next = context();
      const patch = changed(told, next);
      told = next;
      if (Object.keys(patch).length > 0) {
        send({ method: "ui/notifications/host-context-changed", params: patch });
      }
    };

    const tearDown = (): Promise<void> => {
      teardowns += 1;
      tornDown = true;
      channel.consent.dispose();
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

    // Why the view may not act now, or null when it may.
    const refusal = (method: string): string | null => {
      if (!channel.live) {
        return `${method} is refused: this view is drawn from a stored conversation`;
      }
      return tornDown ? `${method} is refused: this view asked to be torn down` : null;
    };

    // Waits for the user's answer, then re-checks the view, which may have gone stored or asked
    // to be torn down meanwhile. Answers the view and resolves false on any refusal.
    const allowed = async (id: RequestId, request: McpAppConsentRequest): Promise<boolean> => {
      const yes = await channel.consent.ask(request);
      const after = refusal(request.method);
      if (after !== null) {
        fail(id, REFUSED, after);
        return false;
      }
      if (!yes) {
        fail(id, REFUSED, request.method === "ui/message" ? MESSAGE_DENIED : TOOL_CALL_DENIED);
      }
      return yes;
    };

    const act = async (id: RequestId, method: string, params: Params): Promise<void> => {
      if (method === "tools/call") {
        const name = params["name"];
        if (typeof name !== "string") {
          fail(id, INVALID_PARAMS, "tools/call needs a tool name");
          return;
        }
        const args = isRecord(params["arguments"]) ? params["arguments"] : {};
        if (!(await allowed(id, { method, name, arguments: args }))) {
          return;
        }
        const result = await services.route({
          serverId: view.activity.serverId,
          method: "tools/call",
          params: { name, arguments: args },
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
      if (text === "") {
        answer(id, { isError: true });
        return;
      }
      if (!(await allowed(id, { method: "ui/message", text }))) {
        return;
      }
      answer(id, (await host.sendMessage(text)) ? {} : { isError: true });
    };

    const onRequest = (id: RequestId, method: string, params: Params): void => {
      if (method === "ui/initialize") {
        initialized = false;
        told = context();
        answer(id, {
          protocolVersion: PROTOCOL_VERSION,
          hostInfo: { name: "agents-web-components", version: VERSION },
          hostCapabilities: HOST_CAPABILITIES,
          hostContext: told,
        });
        return;
      }
      if (method === "ui/request-display-mode") {
        const mode = channel.live && !tornDown ? display.request(params["mode"]) : display.mode;
        answer(id, { mode });
        tellChanges();
        return;
      }
      if (method === "tools/call" || method === "ui/open-link" || method === "ui/message") {
        const refused = refusal(method);
        if (refused !== null) {
          fail(id, REFUSED, refused);
          return;
        }
        act(id, method, params).catch((error: unknown) =>
          fail(id, codeOf(error), messageOf(error)),
        );
        return;
      }
      fail(id, METHOD_NOT_FOUND, `this host does not implement ${method}`);
    };

    const onNotification = (method: string, params: Params): void => {
      if (method === "ui/notifications/initialized") {
        initialized = true;
        told ??= context();
        send({
          method: "ui/notifications/tool-input",
          params: { arguments: view.activity.toolInput },
        });
        send({ method: "ui/notifications/tool-result", params: view.activity.result });
        tellChanges();
        return;
      }
      if (method === "ui/notifications/size-changed") {
        // Kept while fullscreen, where the sheet overrides it, for the return inline.
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
    display.onUserSwitch(tellChanges);
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
