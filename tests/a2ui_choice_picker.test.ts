import { afterEach, describe, expect, it } from "vitest";
import type { A2uiFunction } from "../src/a2ui/core/a2ui_function.js";
import { drawSurface } from "./helpers/a2ui_surface.js";

const FUNCTIONS: Record<string, A2uiFunction> = {
  picked: (_args, context) => {
    const value = context.read("/pick");
    return Array.isArray(value) && value.length > 0;
  },
};

const OPTIONS = [
  { label: "Email", value: "email" },
  { label: { "@path": "/phoneLabel" }, value: "phone" },
  { label: "SMS", value: "sms" },
];

function picker(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "root",
    component: "ChoicePicker",
    label: "Contact by",
    options: OPTIONS,
    value: { "@path": "/pick" },
    ...extra,
  };
}

function inputs(node: HTMLElement): HTMLInputElement[] {
  return [...node.querySelectorAll<HTMLInputElement>('[part="a2ui-choice-picker-input"]')];
}

function options(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>('[part="a2ui-choice-picker-option"]')];
}

function choose(input: HTMLInputElement, checked = true): void {
  input.checked = checked;
  input.dispatchEvent(new Event("change"));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ChoicePicker", () => {
  it("draws one radio per option under its legend, mutually exclusive by default", () => {
    const drawn = drawSurface({
      components: [picker()],
      data: { pick: ["phone"], phoneLabel: "Phone" },
    });
    const root = drawn.byId("root");

    expect(root.tagName).toBe("FIELDSET");
    expect(root.getAttribute("part")).toBe("a2ui-choice-picker");
    expect(root.dataset["variant"]).toBe("mutuallyExclusive");
    expect(root.dataset["display"]).toBe("checkbox");
    expect(root.querySelector('[part="a2ui-choice-picker-label"]')?.textContent).toBe("Contact by");
    expect(root.querySelector('[part="a2ui-choice-picker-filter"]')).toBeNull();
    expect(inputs(root).map((input) => input.type)).toEqual(["radio", "radio", "radio"]);
    expect(new Set(inputs(root).map((input) => input.name)).size).toBe(1);
    expect(
      [...root.querySelectorAll('[part="a2ui-choice-picker-option-text"]')].map(
        (text) => text.textContent,
      ),
    ).toEqual(["Email", "Phone", "SMS"]);
    expect(inputs(root).map((input) => input.checked)).toEqual([false, true, false]);
    expect(options(root).map((option) => option.hasAttribute("data-selected"))).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("writes the one chosen value as a list", () => {
    const drawn = drawSurface({ components: [picker()], data: { pick: ["email"] } });
    const [, phone] = inputs(drawn.node);
    const email = inputs(drawn.node)[0] as HTMLInputElement;

    email.checked = false;
    choose(phone as HTMLInputElement);

    expect(drawn.model.get("/pick")).toEqual(["phone"]);
    expect(options(drawn.node)[1]?.hasAttribute("data-selected")).toBe(true);
  });

  it("writes every checked value in option order for multipleSelection", () => {
    const drawn = drawSurface({
      components: [picker({ variant: "multipleSelection", displayStyle: "chips" })],
    });
    const root = drawn.byId("root");
    const [email, , sms] = inputs(root);

    expect(root.dataset["variant"]).toBe("multipleSelection");
    expect(root.dataset["display"]).toBe("chips");
    expect(inputs(root).map((input) => input.type)).toEqual(["checkbox", "checkbox", "checkbox"]);

    choose(sms as HTMLInputElement);
    choose(email as HTMLInputElement);
    expect(drawn.model.get("/pick")).toEqual(["email", "sms"]);

    choose(sms as HTMLInputElement, false);
    expect(drawn.model.get("/pick")).toEqual(["email"]);
  });

  it("follows the data model, reading anything but a list as nothing chosen", () => {
    const drawn = drawSurface({ components: [picker()], data: { pick: ["sms"] } });

    drawn.model.set("/pick", ["email"]);
    expect(inputs(drawn.node).map((input) => input.checked)).toEqual([true, false, false]);

    drawn.model.set("/pick", "email");
    expect(inputs(drawn.node).map((input) => input.checked)).toEqual([false, false, false]);
  });

  it("skips an option without a string value, and draws none from a non-list", () => {
    const skipping = drawSurface({
      components: [picker({ options: [null, { label: "No value" }, OPTIONS[0]] })],
    });
    expect(options(skipping.node)).toHaveLength(1);

    const none = drawSurface({ components: [picker({ options: "email" })] });
    expect(options(none.node)).toHaveLength(0);
  });

  it("filters the options by label when filterable", () => {
    const drawn = drawSurface({
      components: [picker({ filterable: true })],
      data: { phoneLabel: "Phone" },
    });
    const filter = drawn.node.querySelector(
      '[part="a2ui-choice-picker-filter"]',
    ) as HTMLInputElement;

    expect(filter.type).toBe("search");
    expect(filter.getAttribute("aria-label")).toBe("Contact by");

    filter.value = " PH ";
    filter.dispatchEvent(new Event("input"));
    expect(options(drawn.node).map((option) => option.hidden)).toEqual([true, false, true]);

    drawn.model.set("/phoneLabel", "Call");
    expect(options(drawn.node).map((option) => option.hidden)).toEqual([true, true, true]);

    filter.value = "";
    filter.dispatchEvent(new Event("input"));
    expect(options(drawn.node).map((option) => option.hidden)).toEqual([false, false, false]);
  });

  it("hides an empty legend", () => {
    const drawn = drawSurface({ components: [picker({ label: undefined })] });

    expect(
      (drawn.node.querySelector('[part="a2ui-choice-picker-label"]') as HTMLElement).hidden,
    ).toBe(true);
  });

  it("shows its failing check on the group once a choice changes", () => {
    const drawn = drawSurface({
      components: [
        picker({
          variant: "multipleSelection",
          "@checks": [{ condition: { "@call": "picked" }, message: "Pick one." }],
        }),
      ],
      data: { pick: ["email"] },
      functions: FUNCTIONS,
    });
    const root = drawn.byId("root");
    const message = root.querySelector('[part="a2ui-choice-picker-message"]') as HTMLElement;

    expect(message.hidden).toBe(true);
    choose(inputs(root)[0] as HTMLInputElement, false);
    expect(message.textContent).toBe("Pick one.");
    expect(root.getAttribute("aria-invalid")).toBe("true");
    expect(root.getAttribute("aria-describedby")).toBe(message.id);
  });

  it("disables the group, every option and the filter on a surface that is not live", () => {
    const drawn = drawSurface({
      components: [picker({ filterable: true })],
      data: { pick: ["email"] },
      live: false,
    });
    const root = drawn.byId("root") as HTMLFieldSetElement;

    expect(root.disabled).toBe(true);
    expect(inputs(root).every((input) => input.disabled)).toBe(true);
    expect(
      (root.querySelector('[part="a2ui-choice-picker-filter"]') as HTMLInputElement).disabled,
    ).toBe(true);

    choose(inputs(root)[2] as HTMLInputElement);
    expect(drawn.model.get("/pick")).toEqual(["email"]);
    expect(drawn.actions).toEqual([]);
  });
});
