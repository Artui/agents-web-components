import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { INPUT_STYLES } from "../../src/a2ui/inputs/input_styles.js";
import { drawSurface } from "../helpers/a2ui_surface.js";

const FIELD = {
  id: "root",
  component: "TextField",
  label: "Name",
  value: { "@path": "/form/name" },
};

function withStyles(): void {
  const style = document.createElement("style");
  style.textContent = INPUT_STYLES;
  document.head.append(style);
}

afterEach(() => {
  document.body.replaceChildren();
  for (const style of document.head.querySelectorAll("style")) {
    if (style.textContent === INPUT_STYLES) {
      style.remove();
    }
  }
});

describe("A2UI inputs in a browser", () => {
  it("keeps a TextField's typed value, caret and focus across a redraw of the same message", async () => {
    const drawn = drawSurface({ components: [FIELD], data: { other: 1 } });
    const input = drawn.node.querySelector("input") as HTMLInputElement;

    await userEvent.click(input);
    await userEvent.keyboard("Ada");
    input.setSelectionRange(1, 1);
    expect(drawn.model.get("/form/name")).toBe("Ada");

    drawn.surface.define([FIELD]);
    drawn.model.set("/other", 2);
    drawn.model.set("/form/name", "Ada");

    expect(drawn.node.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Ada");
    expect(input.selectionStart).toBe(1);

    await userEvent.keyboard("x");
    expect(input.value).toBe("Axda");
    expect(drawn.model.get("/form/name")).toBe("Axda");
  });

  it("leaves every input inert on a surface that is not live", async () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "CheckBox", label: "Agree", value: { "@path": "/agree" } },
      ],
      data: { agree: false },
      live: false,
    });
    const box = drawn.node.querySelector("input") as HTMLInputElement;

    await userEvent.click(box, { force: true });

    expect(box.checked).toBe(false);
    expect(drawn.model.get("/agree")).toBe(false);
    expect(drawn.actions).toEqual([]);
  });

  it("toggles a chip by its label and hides a filtered-out option", async () => {
    withStyles();
    const drawn = drawSurface({
      components: [
        {
          id: "root",
          component: "ChoicePicker",
          label: "Tags",
          variant: "multipleSelection",
          displayStyle: "chips",
          filterable: true,
          options: [
            { label: "Red", value: "red" },
            { label: "Blue", value: "blue" },
          ],
          value: { "@path": "/tags" },
        },
      ],
    });
    const [red, blue] = drawn.node.querySelectorAll<HTMLElement>(
      '[part="a2ui-choice-picker-option"]',
    );

    await userEvent.click(red as HTMLElement);
    expect(drawn.model.get("/tags")).toEqual(["red"]);
    expect(red?.hasAttribute("data-selected")).toBe(true);

    const filter = drawn.node.querySelector(
      '[part="a2ui-choice-picker-filter"]',
    ) as HTMLInputElement;
    await userEvent.type(filter, "re");
    expect(getComputedStyle(blue as HTMLElement).display).toBe("none");
    expect(getComputedStyle(red as HTMLElement).display).not.toBe("none");
  });

  it("dispatches one action for one real click, and none once a check fails", async () => {
    const drawn = drawSurface({
      components: [
        {
          id: "root",
          component: "Button",
          child: "missing",
          action: { event: { name: "go" } },
          "@checks": [{ condition: { "@path": "/ready" }, message: "Not ready." }],
        },
      ],
      data: { ready: true },
    });
    const button = drawn.node.querySelector("button") as HTMLButtonElement;

    await userEvent.click(button);
    expect(drawn.actions.map((action) => action.name)).toEqual(["go"]);

    drawn.model.set("/ready", false);
    await userEvent.click(button, { force: true });
    expect(drawn.actions).toHaveLength(1);
    expect(drawn.node.querySelector('[part="a2ui-button-message"]')?.textContent).toBe(
      "Not ready.",
    );
  });
});
