import { afterEach, describe, expect, it } from "vitest";
import type { A2uiFunction } from "../src/a2ui/core/a2ui_function.js";
import { INPUT_COMPONENTS } from "../src/a2ui/inputs/input_components.js";
import { drawSurface } from "./helpers/a2ui_surface.js";

const FUNCTIONS: Record<string, A2uiFunction> = {
  required: (args) => ({ valid: args["value"] !== undefined && args["value"] !== "" }),
  warn: () => ({ valid: false, severity: "warning", message: "Looks short." }),
  silent: () => false,
};

function field(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "root",
    component: "TextField",
    label: "Name",
    value: { "@path": "/name" },
    ...extra,
  };
}

function type(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input"));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("TextField", () => {
  it("draws a labelled input holding the bound value", () => {
    const drawn = drawSurface({ components: [field()], data: { name: "Ada" } });
    const root = drawn.byId("root");
    const label = root.querySelector('[part="a2ui-text-field-label"]') as HTMLLabelElement;
    const input = root.querySelector('[part="a2ui-text-field-input"]') as HTMLInputElement;

    expect(root.getAttribute("part")).toBe("a2ui-text-field");
    expect(root.dataset["variant"]).toBe("shortText");
    expect(input.type).toBe("text");
    expect(input.value).toBe("Ada");
    expect(label.textContent).toBe("Name");
    expect(label.htmlFor).toBe(input.id);
    expect(input.disabled).toBe(false);
  });

  it("writes what the user types to the data model, creating the path", () => {
    const drawn = drawSurface({
      components: [{ ...field(), value: { "@path": "/form/name" } }],
    });
    const input = drawn.node.querySelector("input") as HTMLInputElement;

    type(input, "Grace");

    expect(drawn.model.get("/form/name")).toBe("Grace");
  });

  it("follows a data model change, and leaves the text alone when it already matches", () => {
    const drawn = drawSurface({ components: [field()], data: { name: "a" } });
    const input = drawn.node.querySelector("input") as HTMLInputElement;

    drawn.model.set("/name", "b");
    expect(input.value).toBe("b");

    drawn.model.set("/name", null);
    expect(input.value).toBe("");

    let sets = 0;
    const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
      get: () => own?.get?.call(input),
      set: (next: string) => {
        sets += 1;
        own?.set?.call(input, next);
      },
      configurable: true,
    });
    own?.set?.call(input, "typed");
    drawn.model.set("/name", "typed");
    expect(sets).toBe(0);
  });

  it("draws each variant", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Column", children: ["long", "number", "secret", "odd"] },
        { ...field(), id: "long", variant: "longText" },
        { ...field(), id: "number", variant: "number" },
        { ...field(), id: "secret", variant: "obscured" },
        { ...field(), id: "odd", variant: "huge" },
      ],
      renderers: {
        Column: (component, scope) => {
          const element = document.createElement("div");
          scope.children(component["children"], element);
          return element;
        },
        ...INPUT_COMPONENTS,
      },
    });

    expect(drawn.byId("long").querySelector("textarea")).not.toBeNull();
    const number = drawn.byId("number").querySelector("input") as HTMLInputElement;
    expect(number.type).toBe("text");
    expect(number.inputMode).toBe("decimal");
    expect((drawn.byId("secret").querySelector("input") as HTMLInputElement).type).toBe("password");
    expect(drawn.byId("odd").dataset["variant"]).toBe("shortText");
  });

  it("keeps its placeholder and label current, and hides an empty label", () => {
    const drawn = drawSurface({
      components: [field({ label: { "@path": "/label" }, placeholder: { "@path": "/hint" } })],
      data: { label: "", hint: "e.g. Ada" },
    });
    const input = drawn.node.querySelector("input") as HTMLInputElement;
    const label = drawn.node.querySelector("label") as HTMLLabelElement;

    expect(input.placeholder).toBe("e.g. Ada");
    expect(label.hidden).toBe(true);

    drawn.model.set("/label", "Name");
    drawn.model.set("/hint", null);
    expect(label.hidden).toBe(false);
    expect(input.placeholder).toBe("");
  });

  it("holds its check messages until the user edits or leaves the field", () => {
    const drawn = drawSurface({
      components: [
        field({
          "@checks": [
            {
              condition: { "@call": "required", args: { value: { "@path": "/name" } } },
              message: "Name is required.",
            },
          ],
        }),
      ],
      functions: FUNCTIONS,
    });
    const input = drawn.node.querySelector("input") as HTMLInputElement;
    const message = drawn.node.querySelector('[part="a2ui-text-field-message"]') as HTMLElement;

    expect(message.hidden).toBe(true);
    expect(input.hasAttribute("aria-invalid")).toBe(false);

    input.dispatchEvent(new Event("blur"));
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe("Name is required.");
    expect(message.dataset["severity"]).toBe("error");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);

    type(input, "Ada");
    expect(message.hidden).toBe(true);
    expect(message.dataset["severity"]).toBeUndefined();
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);

    type(input, "");
    expect(message.textContent).toBe("Name is required.");
  });

  it("shows a warning without marking the field invalid, and an error over it", () => {
    const drawn = drawSurface({
      components: [field({ "@checks": [{ condition: { "@call": "warn" } }] })],
      functions: FUNCTIONS,
    });
    const input = drawn.node.querySelector("input") as HTMLInputElement;
    const message = drawn.node.querySelector('[part="a2ui-text-field-message"]') as HTMLElement;
    type(input, "x");

    expect(message.textContent).toBe("Looks short.");
    expect(message.dataset["severity"]).toBe("warning");
    expect(input.hasAttribute("aria-invalid")).toBe(false);

    const mixed = drawSurface({
      components: [
        field({
          "@checks": [{ condition: { "@call": "warn" } }, { condition: { "@call": "silent" } }],
        }),
      ],
      functions: FUNCTIONS,
    });
    const other = mixed.node.querySelector("input") as HTMLInputElement;
    type(other, "x");
    const shown = mixed.node.querySelector('[part="a2ui-text-field-message"]') as HTMLElement;

    expect(shown.textContent).toBe("Looks short.");
    expect(shown.dataset["severity"]).toBe("error");
    expect(other.getAttribute("aria-invalid")).toBe("true");
  });

  it("is disabled and writes nothing on a surface that is not live", () => {
    const drawn = drawSurface({ components: [field()], data: { name: "Ada" }, live: false });
    const input = drawn.node.querySelector("input") as HTMLInputElement;

    expect(input.disabled).toBe(true);
    type(input, "changed");
    expect(drawn.model.get("/name")).toBe("Ada");
    expect(drawn.actions).toEqual([]);
  });

  it("keeps a typed value against a literal value it cannot write back", () => {
    const drawn = drawSurface({ components: [field({ value: "fixed" })] });
    const input = drawn.node.querySelector("input") as HTMLInputElement;

    type(input, "edited");

    expect(input.value).toBe("edited");
    expect(drawn.errors).toEqual([]);
  });
});
