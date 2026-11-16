/**
 * The absolute JSON Pointer a binding's `path` names from `base`: a path that
 * starts with `/` is absolute and `base` is ignored; any other path is
 * relative to `base`, the item a list template is drawing (`""` at the root).
 */
export function joinPointer(base: string, path: string): string {
  if (path.startsWith("/")) {
    return path;
  }
  if (path === "") {
    return base;
  }
  return `${base}/${path}`;
}
