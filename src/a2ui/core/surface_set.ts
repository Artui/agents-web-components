import type { Surface } from "./surface.js";

/**
 * The surfaces one operation list leaves, in creation order. `null` stands for
 * a surface created with a catalog this renderer does not hold, drawn as a
 * notice.
 */
export type SurfaceSet = ReadonlyMap<
  string,
  { readonly surface: Surface | null; readonly catalogId: string }
>;
