import { afterEach, describe, expect, it } from "vitest";
import type { A2uiFunction } from "../src/a2ui/core/a2ui_function.js";
import { drawSurface } from "./helpers/a2ui_surface.js";

const FUNCTIONS: Record<string, A2uiFunction> = {
  ticked: (_args, context) => context.read("/terms") === true,
};

const BOX = {
  id: "root",
  component: "CheckBox",
  label: "I agree",
  value: { "@path": "/terms" },
};

function toggle(input: HTMLInputElement): void {
  input.checked = !input.checked;
  input.dispatchEvent(new Event("change"));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("CheckBox", () => {
  it("draws a labelled checkbox holding the bound value", () => {
    const drawn = drawSurface({ components: [BOX], data: { terms: true } });
    const root = drawn.byId("root");
    const input = root.querySelector('[part="a2ui-check-box-input"]') as HTMLInputElement;

    expect(root.getAttribute("part")).toBe("a2ui-check-box");
    expect(input.type).toBe("checkbox");
    expect(input.checked).toBe(true);
    expect(input.closest('[part="a2ui-check-box-label"]')).not.toBeNull();
    expect(root.querySelector('[part="a2ui-check-box-text"]')?.textContent).toBe("I agree");
  });

  it("writes a toggle to the data model and follows the model back", () => {
    const drawn = drawSurface({ components: [BOX] });
    const input = drawn.node.querySelector("input") as HTMLInputElement;

    expect(input.checked).toBe(false);
    toggle(input);
    expect(drawn.model.get("/terms")).toBe(true);

    drawn.model.set("/terms", "false");
    expect(input.checked).toBe(false);
    drawn.model.set("/terms", { valid: true });
    expect(input.checked).toBe(true);
  });

  it("shows its failing check once toggled", () => {
    const drawn = drawSurface({
      components: [
        { ...BOX, "@checks": [{ condition: { "@call": "ticked" }, message: "Accept the terms." }] },
      ],
      data: { terms: true },
      functions: FUNCTIONS,
    });
    const input = drawn.node.querySelector("input") as HTMLInputElement;
    const message = drawn.node.querySelector('[part="a2ui-check-box-message"]') as HTMLElement;

    expect(message.hidden).toBe(true);
    toggle(input);
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe("Accept the terms.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("is disabled and writes nothing on a surface that is not live", () => {
    const drawn = drawSurface({ components: [BOX], data: { terms: false }, live: false });
    const input = drawn.node.querySelector("input") as HTMLInputElement;

    expect(input.disabled).toBe(true);
    toggle(input);
    expect(drawn.model.get("/terms")).toBe(false);
    expect(drawn.actions).toEqual([]);
  });

  it("takes an @accessibility label on the checkbox", () => {
    const drawn = drawSurface({ components: [{ ...BOX, "@accessibility": { label: "Terms" } }] });

    expect(drawn.node.querySelector("input")?.getAttribute("aria-label")).toBe("Terms");
  });
});
