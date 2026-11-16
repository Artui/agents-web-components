import { describe, expect, it } from "vitest";
import type { A2uiHost } from "../src/a2ui/a2ui_host.js";
import { sha256Hex } from "../src/a2ui/sha256_hex.js";
import { registerA2ui } from "../src/a2ui.js";
import type { ActivityRegistration } from "../src/core/activity_registration.js";
import type { AgUiRunRequest } from "../src/core/agui_client.js";
import fixture from "./fixtures/a2ui_server.json" with { type: "json" };

function drawFixture(live: boolean) {
  const registrations: ActivityRegistration[] = [];
  const runs: AgUiRunRequest[] = [];
  const errors: unknown[] = [];
  const chat: A2uiHost = {
    registerActivityRenderer: (registration) => registrations.push(registration),
    registerContext: () => () => {},
    run: (request) => {
      runs.push(request);
      return Promise.resolve(true);
    },
  };
  registerA2ui(chat, { onError: (message) => errors.push(message) });
  const node = registrations[0]?.render(fixture.surface.content, {
    messageId: fixture.surface.messageId,
    previous: null,
    live,
  }) as HTMLElement;
  document.body.append(node);
  const byId = (id: string) => node.querySelector(`[data-a2ui-id="${id}"]`) as HTMLElement;
  return { node, runs, errors, byId };
}

describe("the server's own surface, drawn by the real catalog", () => {
  it("draws every component with its data, and reports nothing", () => {
    const { node, errors, byId } = drawFixture(true);
    expect(errors).toEqual([]);
    expect(node.querySelector('[part~="a2ui-notice"]')).toBeNull();
    expect(byId("title").textContent).toContain("Hello");
    expect(
      [...byId("items").querySelectorAll('[part~="a2ui-text"]')].map((t) => t.textContent?.trim()),
    ).toEqual(["one", "two"]);
    expect((byId("name").querySelector("input") as HTMLInputElement).value).toBe("Ada");
    expect(byId("go").querySelector("[data-a2ui-control]")?.textContent).toContain("Send");
  });

  it("sends the button's action as the server's user turn", () => {
    const { runs, byId } = drawFixture(true);
    (byId("go").querySelector("button") as HTMLButtonElement).click();
    expect(runs).toHaveLength(1);
    const [request] = runs;
    const runId = request?.runId ?? "";
    const props = request?.forwardedProps as { a2uiAction: { userAction: object } } | undefined;
    const action = props?.a2uiAction.userAction;
    expect(action).toMatchObject({
      name: "submit",
      surfaceId: "s1",
      sourceComponentId: "go",
      userMessage: "Ada",
      context: { name: "Ada" },
    });
    expect(request?.message).toEqual({
      id: `a2ui-action-user-${sha256Hex(runId)}`,
      content: `Ada\n\nA2UI user action:\n${JSON.stringify(action)}`,
    });
  });

  it("draws a replay inert: every control disabled, a click starts no run", () => {
    const { node, runs, errors } = drawFixture(false);
    const controls = [...node.querySelectorAll("button, input, select, textarea")];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect((control as HTMLButtonElement).disabled).toBe(true);
      (control as HTMLElement).click();
    }
    expect(runs).toEqual([]);
    expect(errors).toEqual([]);
  });
});
