import { afterEach, describe, expect, it, vi } from "vitest";
import type { A2uiFunction } from "../src/a2ui/core/a2ui_function.js";
import type { CheckFailure } from "../src/a2ui/core/check_failure.js";
import type { ComponentRenderer } from "../src/a2ui/core/component_renderer.js";
import { drawSurface, TEST_CATALOG_ID } from "./helpers/a2ui_surface.js";

/** Stand-ins for catalog components, written against the scope contract alone. */
const RENDERERS: Record<string, ComponentRenderer> = {
  Box: (component, scope) => {
    const element = document.createElement("div");
    if (component["child"] !== undefined) {
      element.append(scope.child(component["child"]));
    }
    scope.children(component["children"], element);
    return element;
  },
  Label: (component, scope) => {
    const element = document.createElement("span");
    element.setAttribute("part", "label-inner");
    scope.watch(component["text"], (value) => {
      element.textContent = value === undefined || value === null ? "" : String(value);
    });
    return element;
  },
  Field: (component, scope) => {
    const element = document.createElement("input");
    element.disabled = !scope.live;
    scope.watch(component["value"], (value) => {
      element.value = typeof value === "string" ? value : "";
    });
    element.addEventListener("input", () => scope.write(component["value"], element.value));
    scope.checks(component, (failures) => {
      element.dataset["failures"] = JSON.stringify(failures);
    });
    return element;
  },
  Act: (component, scope) => {
    const element = document.createElement("button");
    element.addEventListener("click", () => scope.act(component["action"], component));
    return element;
  },
  Glyph: () => document.createElementNS("http://www.w3.org/2000/svg", "svg"),
};

const FUNCTIONS: Record<string, A2uiFunction> = {
  upper: (args) => String(args["value"]).toUpperCase(),
  required: (args) => ({ valid: args["value"] !== undefined && args["value"] !== "" }),
  readName: (_args, context) => context.read("name"),
  nested: (_args, context) => context.call("upper", { value: { "@path": "/word" } }),
  gesture: (_args, context) => context.userActivation,
  explode: () => {
    throw new Error("boom");
  },
  explodeOddly: () => {
    throw "odd";
  },
};

function draw(components: readonly unknown[], data: unknown = {}, live = true) {
  return drawSurface({ components, data, renderers: RENDERERS, functions: FUNCTIONS, live });
}

function failures(element: HTMLElement): CheckFailure[] {
  return JSON.parse(element.dataset["failures"] ?? "null") as CheckFailure[];
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Surface drawing", () => {
  it("draws from root inside a surface frame, marking each component", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["title"] },
      { id: "title", component: "Label", text: "Hello" },
    ]);
    expect(drawn.node.getAttribute("part")).toBe("a2ui-surface");
    expect(drawn.node.dataset["a2uiSurface"]).toBe("s");
    const title = drawn.byId("title");
    expect(title.textContent).toBe("Hello");
    expect(title.getAttribute("part")).toBe("a2ui-label");
    expect(drawn.byId("root").getAttribute("part")).toBe("a2ui-box");
  });

  it("kebab-cases a two-word type into its part, replacing the renderer's own", () => {
    const drawn = drawSurface({
      components: [{ id: "root", component: "ChoicePicker" }],
      renderers: { ChoicePicker: () => document.createElement("div") },
    });
    expect(drawn.byId("root").getAttribute("part")).toBe("a2ui-choice-picker");
  });

  it("draws a hidden placeholder for an id not defined and for a non-string id", () => {
    const drawn = draw([{ id: "root", component: "Box", children: ["missing", 7] }]);
    const placeholders = drawn.node.querySelectorAll('[part="a2ui-placeholder"]');
    expect(placeholders).toHaveLength(2);
    expect((placeholders[0] as HTMLElement).hidden).toBe(true);
    expect(drawn.errors).toEqual([]);
  });

  it("draws an empty frame with no root yet", () => {
    const drawn = draw([]);
    expect(drawn.node.querySelector('[part="a2ui-placeholder"]')).not.toBeNull();
  });

  it("draws a notice and reports once for a type the catalog does not have", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["a", "b"] },
      { id: "a", component: "Slider" },
      { id: "b", component: "Slider" },
    ]);
    const notices = drawn.node.querySelectorAll('[part="a2ui-notice"]');
    expect(notices).toHaveLength(2);
    expect(notices[0]?.getAttribute("role")).toBe("note");
    expect(notices[0]?.textContent).toContain("Slider");
    expect(drawn.errors).toEqual([
      {
        code: "VALIDATION_FAILED",
        surfaceId: "s",
        message: "component type Slider is not in the catalog",
        path: "/components",
      },
    ]);
  });

  it("refuses a component from another catalog, and accepts its own catalog by name", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["mine", "theirs"] },
      { id: "mine", component: "Label", text: "ok", "@catalogId": TEST_CATALOG_ID },
      { id: "theirs", component: "Label", text: "no", "@catalogId": "other:catalog" },
    ]);
    expect(drawn.byId("mine").textContent).toBe("ok");
    expect(drawn.node.querySelector('[part="a2ui-notice"]')?.textContent).toContain("Label");
  });

  it("draws a notice for a component that contains itself", () => {
    const drawn = draw([
      { id: "root", component: "Box", child: "loop" },
      { id: "loop", component: "Box", child: "root" },
    ]);
    expect(drawn.node.querySelector('[part="a2ui-notice"]')?.textContent).toBe(
      "Box root contains itself.",
    );
    expect(drawn.errors[0]?.code).toBe("VALIDATION_FAILED");
  });

  it("reports a components list that is not an array, and an entry without an id", () => {
    const drawn = draw([{ id: "root", component: "Box" }, { component: "Label" }, "x"]);
    drawn.surface.define("nope");
    expect(drawn.errors.map((error) => error.path)).toEqual([
      "/components/1",
      "/components/2",
      "/components",
    ]);
  });

  it("replaces a component by id on a second define, drawn on the next draw", () => {
    const drawn = draw([{ id: "root", component: "Label", text: "one" }]);
    drawn.surface.define([{ id: "root", component: "Label", text: "two" }]);
    expect(drawn.surface.draw().textContent).toBe("two");
  });

  it("applies weight as flex-grow on an HTML element, and leaves an SVG one alone", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["w", "g"] },
      { id: "w", component: "Label", text: "", weight: 2 },
      { id: "g", component: "Glyph", weight: 3 },
    ]);
    expect(drawn.byId("w").style.flexGrow).toBe("2");
    expect(drawn.node.querySelector('[data-a2ui-id="g"]')?.getAttribute("style")).toBeNull();
  });

  it("maps @accessibility to ARIA and keeps bound attributes current", () => {
    const drawn = draw(
      [
        {
          id: "root",
          component: "Label",
          text: "x",
          "@accessibility": {
            label: { "@path": "/label" },
            description: "More",
            live: "polite",
            hidden: { "@path": "/hidden" },
          },
        },
      ],
      { label: "Name", hidden: true },
    );
    const root = drawn.byId("root");
    expect(root.getAttribute("aria-label")).toBe("Name");
    expect(root.getAttribute("aria-description")).toBe("More");
    expect(root.getAttribute("aria-live")).toBe("polite");
    expect(root.getAttribute("aria-hidden")).toBe("true");
    drawn.model.set("/label", "");
    drawn.model.set("/hidden", false);
    expect(root.hasAttribute("aria-label")).toBe(false);
    expect(root.hasAttribute("aria-hidden")).toBe(false);
  });

  it("sets nothing for an empty @accessibility, and drops a null label", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["a", "b"] },
      { id: "a", component: "Label", text: "x", "@accessibility": {} },
      { id: "b", component: "Label", text: "x", "@accessibility": { label: { "@path": "/n" } } },
    ]);
    expect(drawn.byId("a").getAttributeNames().sort()).toEqual(["data-a2ui-id", "part"]);
    drawn.model.set("/n", "Named");
    drawn.model.set("/n", null);
    expect(drawn.byId("b").hasAttribute("aria-label")).toBe(false);
  });

  it("ignores @accessibility that is not an object", () => {
    const drawn = draw([{ id: "root", component: "Label", text: "x", "@accessibility": "no" }]);
    expect(drawn.byId("root").hasAttribute("aria-label")).toBe(false);
  });
});

describe("Surface bindings", () => {
  it("resolves literals, paths, calls, arrays and plain objects", () => {
    const drawn = draw(
      [
        {
          id: "root",
          component: "Label",
          text: {
            "@call": "upper",
            args: { value: { "@path": "/name" } },
          },
        },
      ],
      { name: "ada" },
    );
    expect(drawn.byId("root").textContent).toBe("ADA");
  });

  it("re-applies a watched value when a write changes it, and only then", () => {
    const apply = vi.fn();
    const drawn = drawSurface({
      components: [{ id: "root", component: "Probe" }],
      data: { name: "a", other: 1 },
      renderers: {
        Probe: (_component, scope) => {
          scope.watch({ "@path": "/name" }, apply);
          return document.createElement("div");
        },
      },
    });
    drawn.model.set("/other", 2);
    drawn.model.set("/name", "b");
    expect(apply.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("resolves a member-by-member value through the scope", () => {
    let resolved: unknown;
    drawSurface({
      components: [{ id: "root", component: "Probe" }],
      data: { n: 1 },
      renderers: {
        Probe: (_component, scope) => {
          resolved = scope.resolve({ a: [{ "@path": "/n" }, 2], b: { "@path": 5 } });
          return document.createElement("div");
        },
      },
    });
    expect(resolved).toEqual({ a: [1, 2], b: undefined });
  });

  it("writes through a path binding, creating it, and updates every reader", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["field", "echo"] },
      { id: "field", component: "Field", value: { "@path": "/form/name" } },
      { id: "echo", component: "Label", text: { "@path": "/form/name" } },
    ]);
    const field = drawn.byId("field") as HTMLInputElement;
    field.value = "Ada";
    field.dispatchEvent(new Event("input"));
    expect(drawn.model.get("/form/name")).toBe("Ada");
    expect(drawn.byId("echo").textContent).toBe("Ada");
  });

  it("writes nothing through a literal, and nothing on a surface not live", () => {
    const literal = draw([{ id: "root", component: "Field", value: "fixed" }]);
    const field = literal.byId("root") as HTMLInputElement;
    field.value = "typed";
    field.dispatchEvent(new Event("input"));
    expect(literal.model.get("/")).toEqual({});

    const inert = draw([{ id: "root", component: "Field", value: { "@path": "/v" } }], {}, false);
    const input = inert.byId("root") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    input.value = "typed";
    input.dispatchEvent(new Event("input"));
    expect(inert.model.get("/v")).toBeUndefined();
  });

  it("gives functions the scope's reads and other functions", () => {
    const drawn = draw(
      [
        { id: "root", component: "Box", children: ["a", "b", "c"] },
        { id: "a", component: "Label", text: { "@call": "readName" } },
        { id: "b", component: "Label", text: { "@call": "nested", args: "not an object" } },
        { id: "c", component: "Label", text: { "@call": "gesture" } },
      ],
      { name: "Ada", word: "hi" },
    );
    expect(drawn.byId("a").textContent).toBe("Ada");
    expect(drawn.byId("b").textContent).toBe("HI");
    expect(drawn.byId("c").textContent).toBe("false");
  });

  it("resolves a failed call to null and reports EXPRESSION_ERROR once", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["a", "b", "c", "d", "e"] },
      { id: "a", component: "Label", text: { "@call": "explode" } },
      { id: "b", component: "Label", text: { "@call": "explodeOddly" } },
      { id: "c", component: "Label", text: { "@call": "nope" } },
      { id: "d", component: "Label", text: { "@call": 3 } },
      { id: "e", component: "Label", text: { "@call": "upper", catalogId: "other", args: {} } },
    ]);
    expect(drawn.byId("a").textContent).toBe("");
    expect(drawn.errors.map((error) => [error.code, error.message])).toEqual([
      ["EXPRESSION_ERROR", "explode failed: boom"],
      ["EXPRESSION_ERROR", "explodeOddly failed: odd"],
      ["EXPRESSION_ERROR", 'unknown function "nope"'],
      ["EXPRESSION_ERROR", "unknown function 3"],
      ["EXPRESSION_ERROR", 'function catalog "other" is not supported'],
    ]);
  });

  it("calls a function by the catalog's own name only", () => {
    const drawn = draw([{ id: "root", component: "Label", text: { "@call": "toString" } }]);
    expect(drawn.errors[0]?.message).toBe('unknown function "toString"');
  });
});

describe("Surface templates", () => {
  const LIST = [
    { id: "root", component: "Box", children: { componentId: "row", path: "/items" } },
    { id: "row", component: "Box", children: ["name", "index"] },
    { id: "name", component: "Label", text: { "@path": "name" } },
    { id: "index", component: "Label", text: { "@call": "@index", args: { offset: 1 } } },
  ];

  it("draws the template once per item, relative paths and @index in the item's scope", () => {
    const drawn = draw(LIST, { items: [{ name: "Ada" }, { name: "Bob" }] });
    const names = [...drawn.node.querySelectorAll('[data-a2ui-id="name"]')];
    const indexes = [...drawn.node.querySelectorAll('[data-a2ui-id="index"]')];
    expect(names.map((node) => node.textContent)).toEqual(["Ada", "Bob"]);
    expect(indexes.map((node) => node.textContent)).toEqual(["1", "2"]);
  });

  it("redraws when the length changes, and updates items in place otherwise", () => {
    const drawn = draw(LIST, { items: [{ name: "Ada" }] });
    const first = drawn.node.querySelector('[data-a2ui-id="name"]');
    drawn.model.set("/items/0/name", "Ann");
    expect(drawn.node.querySelector('[data-a2ui-id="name"]')).toBe(first);
    expect(first?.textContent).toBe("Ann");
    drawn.model.set("/items/1", { name: "Bob" });
    const names = [...drawn.node.querySelectorAll('[data-a2ui-id="name"]')];
    expect(names.map((node) => node.textContent)).toEqual(["Ann", "Bob"]);
    drawn.model.set("/items", null);
    expect(drawn.node.querySelectorAll('[data-a2ui-id="name"]')).toHaveLength(0);
  });

  it("retires nested templates' watchers when the outer list redraws", () => {
    const drawn = draw(
      [
        { id: "root", component: "Box", children: { componentId: "group", path: "/groups" } },
        { id: "group", component: "Box", children: { componentId: "leaf", path: "leaves" } },
        { id: "leaf", component: "Label", text: { "@path": "name" } },
      ],
      { groups: [{ leaves: [{ name: "a" }, { name: "b" }] }] },
    );
    const leaves = () =>
      [...drawn.node.querySelectorAll('[data-a2ui-id="leaf"]')].map((node) => node.textContent);
    expect(leaves()).toEqual(["a", "b"]);
    drawn.model.set("/groups/1", { leaves: [{ name: "c" }] });
    expect(leaves()).toEqual(["a", "b", "c"]);
    drawn.model.set("/groups", [{ leaves: [] }]);
    expect(leaves()).toEqual([]);
  });

  it("treats a missing or non-array list as empty, and ignores a list that is neither form", () => {
    const missing = draw(LIST, {});
    expect(missing.node.querySelectorAll('[data-a2ui-id="row"]')).toHaveLength(0);
    const odd = draw([{ id: "root", component: "Box", children: { componentId: "row" } }]);
    expect(odd.byId("root").childElementCount).toBe(0);
  });

  it("uses the offset only when it is a number, and reports @index outside a template", () => {
    const drawn = draw(
      [
        { id: "root", component: "Box", children: ["outside", "list"] },
        { id: "outside", component: "Label", text: { "@call": "@index" } },
        { id: "list", component: "Box", children: { componentId: "i", path: "/items" } },
        { id: "i", component: "Box", children: ["odd", "plain"] },
        { id: "odd", component: "Label", text: { "@call": "@index", args: { offset: "x" } } },
        { id: "plain", component: "Label", text: { "@call": "@index" } },
      ],
      { items: [1] },
    );
    expect(drawn.byId("outside").textContent).toBe("");
    expect(drawn.byId("odd").textContent).toBe("0");
    expect(drawn.byId("plain").textContent).toBe("0");
    expect(drawn.errors[0]?.message).toBe("@index is only defined inside a list template");
  });
});

describe("Surface checks", () => {
  it("reports failing checks and updates them as the model changes", () => {
    const drawn = draw([
      {
        id: "root",
        component: "Field",
        value: { "@path": "/v" },
        "@checks": [
          {
            condition: { "@call": "required", args: { value: { "@path": "/v" } } },
            message: "Required",
          },
          { condition: { "@path": "/rule" } },
          "not a rule",
          { condition: { "@path": "/coded" }, message: 5 },
        ],
      },
    ]);
    const field = drawn.byId("root");
    expect(failures(field)).toEqual([
      { message: "Required", severity: "error" },
      { message: "", severity: "error" },
      { message: "", severity: "error" },
    ]);
    drawn.model.set("/", {
      v: "x",
      rule: true,
      coded: { valid: false, code: "C", severity: "warning", message: "Careful" },
    });
    expect(failures(field)).toEqual([{ message: "Careful", severity: "warning", code: "C" }]);
  });

  it("reports nothing for a component without checks", () => {
    const drawn = draw([{ id: "root", component: "Field", value: "x" }]);
    expect(failures(drawn.byId("root"))).toEqual([]);
  });
});

describe("Surface actions", () => {
  it("sends an event with its context and userMessage resolved", () => {
    vi.useFakeTimers({ now: new Date("2026-11-16T10:00:00Z") });
    const drawn = draw(
      [
        {
          id: "root",
          component: "Act",
          action: {
            event: {
              name: "submit",
              userMessage: { "@path": "/message" },
              context: { email: { "@path": "/email" }, fixed: 1 },
            },
          },
        },
      ],
      { email: "a@example.com", message: "Sent" },
    );
    drawn.byId("root").click();
    vi.useRealTimers();
    expect(drawn.actions).toEqual([
      {
        name: "submit",
        surfaceId: "s",
        sourceComponentId: "root",
        timestamp: "2026-11-16T10:00:00.000Z",
        userMessage: "Sent",
        context: { email: "a@example.com", fixed: 1 },
      },
    ]);
    expect(Object.keys(drawn.actions[0] ?? {})).toEqual([
      "name",
      "surfaceId",
      "sourceComponentId",
      "timestamp",
      "userMessage",
      "context",
    ]);
  });

  it("leaves out an empty or missing userMessage and a context that is not an object", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["a", "b", "c"] },
      { id: "a", component: "Act", action: { event: { name: "a", userMessage: "" } } },
      { id: "b", component: "Act", action: { event: { name: "b", context: "x" } } },
      {
        id: "c",
        component: "Act",
        action: { event: { name: "c", userMessage: { "@path": "/n" } } },
      },
    ]);
    for (const id of ["a", "b", "c"]) {
      drawn.byId(id).click();
    }
    expect(drawn.actions.map((action) => [action.userMessage, action.context])).toEqual([
      [undefined, {}],
      [undefined, {}],
      [undefined, {}],
    ]);
  });

  it("runs a functionCall here with user activation, an error reported as EXECUTION_ERROR", () => {
    const seen = vi.fn();
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Box", children: ["ok", "bad"] },
        { id: "ok", component: "Act", action: { functionCall: { "@call": "seen" } } },
        { id: "bad", component: "Act", action: { functionCall: { "@call": "explode" } } },
      ],
      renderers: RENDERERS,
      functions: {
        ...FUNCTIONS,
        seen: (_args, context) => seen(context.userActivation),
      },
    });
    drawn.byId("ok").click();
    drawn.byId("bad").click();
    expect(seen).toHaveBeenCalledWith(true);
    expect(drawn.actions).toEqual([]);
    expect(drawn.errors).toEqual([
      { code: "EXECUTION_ERROR", surfaceId: "s", message: "explode failed: boom" },
    ]);
  });

  it("reports an event without a name and ignores an action of neither kind", () => {
    const drawn = draw([
      { id: "root", component: "Box", children: ["a", "b", "c"] },
      { id: "a", component: "Act", action: { event: {} } },
      { id: "b", component: "Act", action: { other: 1 } },
      { id: "c", component: "Act", action: "x" },
    ]);
    for (const id of ["a", "b", "c"]) {
      drawn.byId(id).click();
    }
    expect(drawn.actions).toEqual([]);
    expect(drawn.errors.map((error) => error.message)).toEqual(["the action of a has no name"]);
  });

  it("does nothing on a surface not live", () => {
    const drawn = draw(
      [{ id: "root", component: "Act", action: { event: { name: "go" } } }],
      {},
      false,
    );
    drawn.byId("root").click();
    expect(drawn.actions).toEqual([]);
  });
});

describe("Surface lifetime", () => {
  it("retires the watchers of the last draw on redraw and on dispose", () => {
    const apply = vi.fn();
    const drawn = drawSurface({
      components: [{ id: "root", component: "Probe" }],
      renderers: {
        Probe: (_component, scope) => {
          scope.watch({ "@path": "/n" }, apply);
          return document.createElement("div");
        },
      },
    });
    drawn.surface.draw();
    drawn.surface.dispose();
    drawn.surface.dispose();
    apply.mockClear();
    drawn.model.set("/n", 1);
    expect(apply).not.toHaveBeenCalled();
  });
});
