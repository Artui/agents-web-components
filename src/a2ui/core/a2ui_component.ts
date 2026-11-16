/**
 * One component of a surface, as the agent sent it: the flat adjacency-list
 * form of A2UI 1.0, with `id`, the `component` type name, and every other
 * property at the top level. Read properties by index (`component["text"]`):
 * their values are literals, `{"@path"}` bindings or `{"@call"}` calls, and
 * only {@link SurfaceScope.resolve} knows which.
 */
export interface A2uiComponent {
  readonly id: string;
  readonly component: string;
  readonly [property: string]: unknown;
}
