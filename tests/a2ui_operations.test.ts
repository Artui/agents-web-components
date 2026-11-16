import { describe, expect, it } from "vitest";
import type { A2uiError } from "../src/a2ui/core/a2ui_error.js";
import { applyOperations } from "../src/a2ui/core/apply_operations.js";
import type { ComponentRenderer } from "../src/a2ui/core/component_renderer.js";

const CATALOG = "test:catalog";
const Label: ComponentRenderer = (component, scope) => {
  const element = document.createElement("span");
  scope.watch(component["text"], (value) => {
    element.textContent = String(value);
  });
  return element;
};

function apply(operations: readonly unknown[]) {
  const errors: A2uiError[] = [];
  const surfaces = applyOperations(operations, {
    catalogId: CATALOG,
    components: { Label },
    functions: {},
    live: true,
    onAction: () => {},
    onError: (error) => errors.push(error),
  });
  return { surfaces, errors };
}

const create = (surfaceId: string, extra: object = {}) => ({
  version: "1.0",
  createSurface: { surfaceId, catalogId: CATALOG, ...extra },
});
const ROOT = [{ id: "root", component: "Label", text: { "@path": "/name" } }];

describe("applyOperations", () => {
  it("creates a surface from inline components and data model, data first", () => {
    const { surfaces, errors } = apply([
      create("s", { components: ROOT, dataModel: { name: "Ada" } }),
    ]);
    expect(errors).toEqual([]);
    expect(surfaces.get("s")?.surface?.draw().textContent).toBe("Ada");
  });

  it("applies updateComponents and updateDataModel in order, path defaulting to the root", () => {
    const { surfaces } = apply([
      create("s"),
      { version: "1.0", updateComponents: { surfaceId: "s", components: ROOT } },
      { version: "1.0", updateDataModel: { surfaceId: "s", value: { name: "Ada" } } },
      { version: "1.0", updateDataModel: { surfaceId: "s", path: "/name", value: "Grace" } },
    ]);
    expect(surfaces.get("s")?.surface?.draw().textContent).toBe("Grace");
  });

  it("deletes a surface, and keeps the others in creation order", () => {
    const { surfaces } = apply([
      create("a"),
      create("b"),
      create("c"),
      { version: "1.0", deleteSurface: { surfaceId: "b" } },
    ]);
    expect([...surfaces.keys()]).toEqual(["a", "c"]);
  });

  it("keeps a foreign catalog's surface as null and reports it once", () => {
    const { surfaces, errors } = apply([
      { version: "1.0", createSurface: { surfaceId: "s", catalogId: "other" } },
      { version: "1.0", updateComponents: { surfaceId: "s", components: ROOT } },
      { version: "1.0", updateDataModel: { surfaceId: "s", value: {} } },
    ]);
    expect(surfaces.get("s")).toEqual({ surface: null, catalogId: "other" });
    expect(errors).toEqual([
      {
        code: "VALIDATION_FAILED",
        surfaceId: "s",
        message: 'catalog "other" is not supported',
        path: "/a2ui_operations/0/createSurface/catalogId",
      },
    ]);
  });

  it("treats a missing catalog id as foreign", () => {
    const { surfaces } = apply([{ version: "1.0", createSurface: { surfaceId: "s" } }]);
    expect(surfaces.get("s")).toEqual({ surface: null, catalogId: "" });
  });

  it("reports a surface created twice as an integrity error and keeps the first", () => {
    const { surfaces, errors } = apply([create("s", { components: ROOT }), create("s")]);
    expect(surfaces.get("s")?.surface).not.toBeNull();
    expect(errors).toEqual([
      { code: "INTEGRITY_ERROR", surfaceId: "s", message: "surface s already exists" },
    ]);
  });

  it.each([
    [42, "", "a message must be an object", "/a2ui_operations/0"],
    [
      { version: "0.9", createSurface: { surfaceId: "s" } },
      "s",
      'protocol version "0.9" is not 1.0',
      "/a2ui_operations/0/version",
    ],
    [
      { createSurface: { surfaceId: "s" } },
      "s",
      "protocol version undefined is not 1.0",
      "/a2ui_operations/0/version",
    ],
    [{ version: "1.0", callRendererFunction: {} }, "", "unsupported message", "/a2ui_operations/0"],
    [
      { version: "1.0", createSurface: { surfaceId: "" } },
      "",
      "surfaceId must be a non-empty string",
      "/a2ui_operations/0/createSurface/surfaceId",
    ],
    [
      { version: "1.0", deleteSurface: { surfaceId: 7 } },
      "",
      "surfaceId must be a non-empty string",
      "/a2ui_operations/0/deleteSurface/surfaceId",
    ],
    [
      { version: "1.0", updateComponents: { surfaceId: "x", components: [] } },
      "x",
      "surface x was not created",
      "/a2ui_operations/0",
    ],
  ])("skips and reports %j", (operation, surfaceId, message, path) => {
    const { surfaces, errors } = apply([operation]);
    expect(surfaces.size).toBe(0);
    expect(errors).toEqual([{ code: "VALIDATION_FAILED", surfaceId, message, path }]);
  });

  it("reports an updateDataModel without a value, since null is what deletes", () => {
    const { errors } = apply([
      create("s"),
      { version: "1.0", updateDataModel: { surfaceId: "s" } },
    ]);
    expect(errors).toEqual([
      {
        code: "VALIDATION_FAILED",
        surfaceId: "s",
        message: "updateDataModel needs a value; null deletes",
        path: "/a2ui_operations/1/updateDataModel/value",
      },
    ]);
  });
});
