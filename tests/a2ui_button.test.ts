import { afterEach, describe, expect, it } from "vitest";
import type { A2uiFunction } from "../src/a2ui/core/a2ui_function.js";
import type { ComponentRenderer } from "../src/a2ui/core/component_renderer.js";
import { INPUT_COMPONENTS } from "../src/a2ui/inputs/input_components.js";
import { drawSurface } from "./helpers/a2ui_surface.js";

const RENDERERS: Record<string, ComponentRenderer> = {
  ...INPUT_COMPONENTS,
  Label: (component) => {
    const element = document.createElement("span");
    element.textContent = String(component["text"]);
    return element;
  },
};

const FUNCTIONS: Record<string, A2uiFunction> = {
  required: (args) => ({ valid: args["value"] !== undefined && args["value"] !== "" }),
  quiet: () => false,
};

const LABEL = { id: "label", component: "Label", text: "Send" };

function submit(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "root",
    component: "Button",
    child: "label",
    action: { event: { name: "submit", context: { email: { "@path": "/email" } } } },
    ...extra,
  };
}

function control(node: HTMLElement): HTMLButtonElement {
  return node.querySelector('[part="a2ui-button-control"]') as HTMLButtonElement;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Button", () => {
  it("draws its child inside a native button", () => {
    const drawn = drawSurface({ components: [submit(), LABEL], renderers: RENDERERS });
    const root = drawn.byId("root");

    expect(root.getAttribute("part")).toBe("a2ui-button");
    expect(root.dataset["variant"]).toBe("default");
    expect(control(root).type).toBe("button");
    expect(control(root).textContent).toBe("Send");
    expect(control(root).disabled).toBe(false);
  });

  it("states its variant, and the default for one it does not know", () => {
    const primary = drawSurface({
      components: [submit({ variant: "primary" }), LABEL],
      renderers: RENDERERS,
    });
    const odd = drawSurface({
      components: [submit({ variant: "loud" }), LABEL],
      renderers: RENDERERS,
    });

    expect(primary.byId("root").dataset["variant"]).toBe("primary");
    expect(odd.byId("root").dataset["variant"]).toBe("default");
  });

  it("dispatches exactly one action per click, with its context resolved", () => {
    const drawn = drawSurface({
      components: [submit(), LABEL],
      data: { email: "a@b.c" },
      renderers: RENDERERS,
    });

    control(drawn.node).click();

    expect(drawn.actions).toHaveLength(1);
    expect(drawn.actions[0]).toMatchObject({
      name: "submit",
      sourceComponentId: "root",
      context: { email: "a@b.c" },
    });
  });

  it("is disabled and shows the message while a check fails, and enables when it passes", () => {
    const drawn = drawSurface({
      components: [
        submit({
          "@checks": [
            {
              condition: { "@call": "required", args: { value: { "@path": "/email" } } },
              message: "Enter an email first.",
            },
          ],
        }),
        LABEL,
      ],
      renderers: RENDERERS,
      functions: FUNCTIONS,
    });
    const button = control(drawn.node);
    const message = drawn.node.querySelector('[part="a2ui-button-message"]') as HTMLElement;

    expect(button.disabled).toBe(true);
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe("Enter an email first.");
    expect(button.getAttribute("aria-describedby")).toBe(message.id);
    button.dispatchEvent(new MouseEvent("click"));
    expect(drawn.actions).toEqual([]);

    drawn.model.set("/email", "a@b.c");
    expect(button.disabled).toBe(false);
    expect(message.hidden).toBe(true);
    expect(button.hasAttribute("aria-describedby")).toBe(false);
  });

  it("is disabled by a failing check without a message, showing nothing", () => {
    const drawn = drawSurface({
      components: [submit({ "@checks": [{ condition: { "@call": "quiet" } }] }), LABEL],
      renderers: RENDERERS,
      functions: FUNCTIONS,
    });

    expect(control(drawn.node).disabled).toBe(true);
    expect((drawn.node.querySelector('[part="a2ui-button-message"]') as HTMLElement).hidden).toBe(
      true,
    );
  });

  it("is disabled and dispatches nothing on a surface that is not live", () => {
    const drawn = drawSurface({
      components: [submit(), LABEL],
      renderers: RENDERERS,
      live: false,
    });
    const button = control(drawn.node);

    expect(button.disabled).toBe(true);
    button.dispatchEvent(new MouseEvent("click"));
    expect(drawn.actions).toEqual([]);
  });

  it("takes an @accessibility label on the native button, not the wrapper", () => {
    const drawn = drawSurface({
      components: [submit({ "@accessibility": { label: "Send the form" } }), LABEL],
      renderers: RENDERERS,
    });

    expect(control(drawn.node).getAttribute("aria-label")).toBe("Send the form");
    expect(drawn.byId("root").hasAttribute("aria-label")).toBe(false);
  });
});
