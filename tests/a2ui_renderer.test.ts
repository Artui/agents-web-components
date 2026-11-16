import type { Context } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { A2UI_CATALOG } from "../src/a2ui/a2ui_catalog.js";
import type { A2uiHost } from "../src/a2ui/a2ui_host.js";
import { registerA2ui } from "../src/a2ui.js";
import type { ActivityRegistration } from "../src/core/activity_registration.js";

function host() {
  const registrations: ActivityRegistration[] = [];
  const chat: A2uiHost = {
    registerActivityRenderer: (registration) => registrations.push(registration),
    registerContext: (_provider: () => Context[]) => () => {},
    run: () => Promise.resolve(true),
  };
  const render = (content: unknown, previous: Node | null = null) => {
    const registration = registrations[0];
    if (registration === undefined) {
      throw new Error("nothing registered");
    }
    return registration.render(content, { messageId: "m", previous, live: true });
  };
  return { chat, render };
}

const FORM = () => ({
  a2ui_operations: [
    {
      version: "1.0",
      createSurface: {
        surfaceId: "s",
        catalogId: A2UI_CATALOG.catalogId,
        dataModel: { form: { name: "Ada" } },
        components: [
          { id: "root", component: "TextField", label: "Name", value: { "@path": "/form/name" } },
        ],
      },
    },
    { version: "1.0", updateDataModel: { surfaceId: "s", path: "/extra", value: { n: 1 } } },
  ],
});

describe("a2uiRenderer", () => {
  it("leaves the content it was given as it was, so the same content is the same draw", () => {
    const { chat, render } = host();
    registerA2ui(chat);
    const content = FORM();
    const before = structuredClone(content);
    const node = render(content) as HTMLElement;
    const input = node.querySelector("input");
    if (input === null) {
      throw new Error("no input drawn");
    }
    input.value = "Grace";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(content).toEqual(before);
    expect(render(content, node)).toBe(node);
  });
});
