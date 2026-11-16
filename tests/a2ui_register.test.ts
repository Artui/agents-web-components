import type { Context } from "@ag-ui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { A2UI_CATALOG } from "../src/a2ui/a2ui_catalog.js";
import type { A2uiHost } from "../src/a2ui/a2ui_host.js";
import type { A2uiErrorMessage } from "../src/a2ui/core/a2ui_error_message.js";
import { sha256Hex } from "../src/a2ui/sha256_hex.js";
import { registerA2ui } from "../src/a2ui.js";
import type { ActivityRegistration } from "../src/core/activity_registration.js";
import type { AgUiRunRequest } from "../src/core/agui_client.js";
import fixture from "./fixtures/a2ui_server.json" with { type: "json" };

vi.mock("../src/a2ui/catalog_components.js", () => ({
  CATALOG_COMPONENTS: {
    Probe: (
      component: Record<string, unknown>,
      scope: import("../src/a2ui/core/surface_scope.js").SurfaceScope,
    ) => {
      const button = document.createElement("button");
      button.addEventListener("click", () => scope.act(component["action"], component as never));
      return button;
    },
  },
}));

function host() {
  const registrations: ActivityRegistration[] = [];
  const providers: (() => Context[])[] = [];
  const runs: AgUiRunRequest[] = [];
  const chat: A2uiHost = {
    registerActivityRenderer: (registration) => registrations.push(registration),
    registerContext: (provider) => {
      providers.push(provider);
      return () => providers.splice(providers.indexOf(provider), 1);
    },
    run: (request) => {
      runs.push(request);
      return Promise.resolve(true);
    },
  };
  const render = (content: unknown, live = true, previous: Node | null = null) => {
    const registration = registrations[0];
    if (registration === undefined) {
      throw new Error("nothing registered");
    }
    return registration.render(content, { messageId: "m", previous, live });
  };
  return { chat, registrations, providers, runs, render };
}

const PROBE = (catalogId: string = A2UI_CATALOG.catalogId) => ({
  a2ui_operations: [
    {
      version: "1.0",
      createSurface: {
        surfaceId: "s",
        catalogId,
        dataModel: { who: "Ada" },
        components: [
          {
            id: "root",
            component: "Probe",
            action: {
              event: {
                name: "go",
                userMessage: { "@path": "/who" },
                context: { who: { "@path": "/who" } },
              },
            },
          },
        ],
      },
    },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerA2ui", () => {
  it("registers the a2ui-surface renderer", () => {
    const { chat, registrations } = host();
    registerA2ui(chat);
    expect(registrations.map((registration) => registration.type)).toEqual(["a2ui-surface"]);
  });

  it("posts the catalog under the description the server looks it up by, until unregistered", () => {
    const { chat, providers } = host();
    const unregister = registerA2ui(chat);
    const [entry] = providers[0]?.() ?? [];
    expect(entry?.description).toBe(fixture.contextDescription);
    expect(JSON.parse(entry?.value ?? "")).toEqual(A2UI_CATALOG);
    unregister();
    expect(providers).toEqual([]);
  });

  it("draws each surface of the server's own snapshot", () => {
    const { chat, render } = host();
    registerA2ui(chat, { onError: () => {} });
    const node = render(fixture.surface.content) as HTMLElement;
    expect(node.querySelector("style")?.textContent).toContain("a2ui-surface");
    expect(node.querySelector('[part~="a2ui-surface"]')?.getAttribute("data-a2ui-surface")).toBe(
      "s1",
    );
  });

  it("returns null for content that is not an operation list", () => {
    const { chat, render } = host();
    registerA2ui(chat);
    expect(render({ a2ui_operations: "no" })).toBeNull();
    expect(render(null)).toBeNull();
  });

  it("keeps the node on screen for the same content, and redraws for new content", () => {
    const { chat, render } = host();
    registerA2ui(chat);
    const first = render(PROBE()) as Node;
    expect(render(PROBE(), true, first)).toBe(first);
    expect(render(PROBE(), false, first)).not.toBe(first);
    const other = { a2ui_operations: [] };
    expect(render(other, true, first)).not.toBe(first);
  });

  it("starts a run for a live surface's action, named as the server names its turn", () => {
    const { chat, render, runs } = host();
    registerA2ui(chat);
    const node = render(PROBE()) as HTMLElement;
    node.querySelector("button")?.click();
    const [request] = runs;
    const runId = request?.runId ?? "";
    expect(runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(request?.message?.id).toBe(`a2ui-action-user-${sha256Hex(runId)}`);
    expect(request?.forwardedProps).toMatchObject({
      a2uiAction: {
        userAction: {
          name: "go",
          surfaceId: "s",
          sourceComponentId: "root",
          userMessage: "Ada",
          context: { who: "Ada" },
        },
      },
    });
    expect(request?.message?.content.startsWith("Ada\n\nA2UI user action:\n{")).toBe(true);
  });

  it("gives each click of a live action its own run and its own user turn", () => {
    const { chat, render, runs } = host();
    registerA2ui(chat);
    const button = (render(PROBE()) as HTMLElement).querySelector("button");
    button?.click();
    button?.click();
    const [first, second] = runs;
    expect(runs).toHaveLength(2);
    expect(first?.runId).not.toBe(second?.runId);
    expect(first?.message?.id).not.toBe(second?.message?.id);
  });

  it("draws a replayed surface inert: no run, no error", () => {
    const { chat, render, runs } = host();
    const errors: A2uiErrorMessage[] = [];
    registerA2ui(chat, { onError: (message) => errors.push(message) });
    const node = render(PROBE("other"), false) as HTMLElement;
    (render(PROBE(), false) as HTMLElement).querySelector("button")?.click();
    expect(runs).toEqual([]);
    expect(errors).toEqual([]);
    expect(node.querySelector('[part~="a2ui-notice"]')).not.toBeNull();
  });

  it("draws a notice for a catalog it does not hold and hands the spec's error to the host", () => {
    const { chat, render } = host();
    const errors: A2uiErrorMessage[] = [];
    registerA2ui(chat, { onError: (message) => errors.push(message) });
    const node = render(PROBE("other")) as HTMLElement;
    expect(node.querySelector('[part~="a2ui-notice"]')?.textContent).toBe(
      "This surface uses the catalog other, which cannot be drawn here.",
    );
    expect(errors).toEqual([
      {
        version: "1.0",
        error: {
          code: "VALIDATION_FAILED",
          surfaceId: "s",
          message: 'catalog "other" is not supported',
          path: "/a2ui_operations/0/createSurface/catalogId",
        },
      },
    ]);
  });

  it("draws a notice for a component it does not hold and reports it", () => {
    const { chat, render } = host();
    const errors: A2uiErrorMessage[] = [];
    registerA2ui(chat, { onError: (message) => errors.push(message) });
    const content = {
      a2ui_operations: [
        {
          version: "1.0",
          createSurface: {
            surfaceId: "s",
            catalogId: A2UI_CATALOG.catalogId,
            components: [{ id: "root", component: "Video" }],
          },
        },
      ],
    };
    const node = render(content) as HTMLElement;
    expect(node.querySelector('[part~="a2ui-notice"]')?.textContent).toContain("Video");
    expect(errors.map((message) => message.error.code)).toEqual(["VALIDATION_FAILED"]);
  });

  it("warns on the console when the host gives no onError", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { chat, render } = host();
    registerA2ui(chat);
    render(PROBE("other"));
    expect(warn).toHaveBeenCalledWith("A2UI error", expect.objectContaining({ version: "1.0" }));
  });
});
