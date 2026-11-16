import type { A2uiError } from "./a2ui_error.js";
import { idCounter } from "./id_counter.js";
import { isObject } from "./is_object.js";
import type { OperationsOptions } from "./operations_options.js";
import { Surface } from "./surface.js";
import type { SurfaceSet } from "./surface_set.js";

const KINDS = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"] as const;

/**
 * Apply A2UI 1.0 agent-to-renderer messages in order and return the surfaces
 * they leave.
 *
 * A message that cannot be applied is skipped and reported: a version other
 * than `1.0`, a kind this renderer does not take, a surface created twice
 * (`INTEGRITY_ERROR`) or one updated before it was created.
 */
export function applyOperations(
  operations: readonly unknown[],
  options: OperationsOptions,
): SurfaceSet {
  const surfaces = new Map<string, { surface: Surface | null; catalogId: string }>();
  const report = (error: A2uiError): void => options.onError(error);
  const nextId = options.nextId ?? idCounter();
  for (const [i, operation] of operations.entries()) {
    const at = `/a2ui_operations/${i}`;
    if (!isObject(operation)) {
      report({
        code: "VALIDATION_FAILED",
        surfaceId: "",
        message: "a message must be an object",
        path: at,
      });
      continue;
    }
    const kind = KINDS.find((name) => isObject(operation[name]));
    const body =
      kind === undefined ? undefined : (operation[kind] as Readonly<Record<string, unknown>>);
    const surfaceId = typeof body?.["surfaceId"] === "string" ? body["surfaceId"] : "";
    if (operation["version"] !== "1.0") {
      report({
        code: "VALIDATION_FAILED",
        surfaceId,
        message: `protocol version ${JSON.stringify(operation["version"])} is not 1.0`,
        path: `${at}/version`,
      });
      continue;
    }
    if (kind === undefined || body === undefined) {
      report({ code: "VALIDATION_FAILED", surfaceId, message: "unsupported message", path: at });
      continue;
    }
    if (surfaceId === "") {
      report({
        code: "VALIDATION_FAILED",
        surfaceId,
        message: "surfaceId must be a non-empty string",
        path: `${at}/${kind}/surfaceId`,
      });
      continue;
    }
    if (kind === "createSurface") {
      if (surfaces.has(surfaceId)) {
        report({
          code: "INTEGRITY_ERROR",
          surfaceId,
          message: `surface ${surfaceId} already exists`,
        });
        continue;
      }
      const catalogId = typeof body["catalogId"] === "string" ? body["catalogId"] : "";
      if (catalogId !== options.catalogId) {
        report({
          code: "VALIDATION_FAILED",
          surfaceId,
          message: `catalog ${JSON.stringify(catalogId)} is not supported`,
          path: `${at}/createSurface/catalogId`,
        });
        surfaces.set(surfaceId, { surface: null, catalogId });
        continue;
      }
      const surface = new Surface({ ...options, nextId, surfaceId });
      if ("dataModel" in body) {
        surface.model.set("/", body["dataModel"]);
      }
      if ("components" in body) {
        surface.define(body["components"]);
      }
      surfaces.set(surfaceId, { surface, catalogId });
      continue;
    }
    const entry = surfaces.get(surfaceId);
    if (entry === undefined) {
      report({
        code: "VALIDATION_FAILED",
        surfaceId,
        message: `surface ${surfaceId} was not created`,
        path: at,
      });
      continue;
    }
    // A foreign catalog's surface was reported once, at createSurface.
    if (kind === "deleteSurface") {
      surfaces.delete(surfaceId);
    } else if (entry.surface === null) {
    } else if (kind === "updateComponents") {
      entry.surface.define(body["components"]);
    } else if (!("value" in body)) {
      report({
        code: "VALIDATION_FAILED",
        surfaceId,
        message: "updateDataModel needs a value; null deletes",
        path: `${at}/updateDataModel/value`,
      });
    } else {
      entry.surface.model.set(typeof body["path"] === "string" ? body["path"] : "/", body["value"]);
    }
  }
  return surfaces;
}
