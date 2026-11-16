import type { A2uiComponent } from "./a2ui_component.js";
import type { CheckFailure } from "./check_failure.js";

/**
 * What a {@link ComponentRenderer} draws with: the surface's data model, its
 * other components, and the way back to the agent, all seen from where the
 * component sits. Inside a list template the scope's base is the item being
 * drawn, so a relative `{"@path": "name"}` reads that item's `name`.
 *
 * Nothing here needs `this`: the methods may be passed around detached.
 */
export interface SurfaceScope {
  readonly surfaceId: string;
  /**
   * `false` when the surface is a replay of a turn long past. Draw every
   * control disabled; {@link act} and {@link write} then do nothing anyway.
   */
  readonly live: boolean;
  /**
   * A property's value now: a literal as is, `{"@path"}` read from the data
   * model, `{"@call"}` evaluated (its args resolved first), arrays and plain
   * objects resolved member by member. A failed call resolves to `null`.
   */
  resolve(value: unknown): unknown;
  /**
   * Call `apply` with the property's value now, and again each time a data
   * model write changes it, for as long as the node stays drawn. This is how a
   * component stays current: never read the model once and keep the result.
   */
  watch(value: unknown, apply: (resolved: unknown) => void): void;
  /**
   * Write `value` where a `{"@path"}` binding points, creating the path when
   * missing. Does nothing for any other binding, or on a surface not live.
   */
  write(binding: unknown, value: unknown): void;
  /**
   * The node for the component with this id: its renderer's element, or a
   * placeholder while the id is not (yet) defined, or a notice for a type the
   * catalog does not know.
   */
  child(id: unknown): Node;
  /**
   * Fill `container` with a `ChildList`: an array of ids, or a template
   * `{componentId, path}` drawn once per item of the array at `path` and
   * redrawn when the array's length changes.
   */
  children(list: unknown, container: Element): void;
  /**
   * Run an `Action` from a user gesture: `{event}` goes to the agent,
   * `{functionCall}` runs here. Does nothing on a surface not live.
   */
  act(action: unknown, component: A2uiComponent): void;
  /**
   * Evaluate the component's `@checks` now and after every change, calling
   * `apply` with the ones that fail (an empty list when all pass).
   */
  checks(component: A2uiComponent, apply: (failures: readonly CheckFailure[]) => void): void;
}
