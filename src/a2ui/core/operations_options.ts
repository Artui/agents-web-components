import type { SurfaceOptions } from "./surface.js";

/** What `applyOperations` builds surfaces with: the catalog it holds and the surfaces' sinks. */
export type OperationsOptions = Omit<SurfaceOptions, "surfaceId">;
