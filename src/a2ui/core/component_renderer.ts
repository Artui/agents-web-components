import type { A2uiComponent } from "./a2ui_component.js";
import type { SurfaceScope } from "./surface_scope.js";

/**
 * Draw one catalog component. Return its element, built by hand, with every
 * bound property kept current through {@link SurfaceScope.watch}, and its
 * children placed through {@link SurfaceScope.child} or
 * {@link SurfaceScope.children}.
 *
 * The core does the rest on the returned element, so a renderer must not: it
 * sets `part="a2ui-<kebab-case type>"` (`a2ui-text`, `a2ui-choice-picker`),
 * replacing any, and `data-a2ui-id`, maps `@accessibility` to ARIA, and
 * applies `weight` as `flex-grow`. Name inner elements' parts
 * `a2ui-<type>-<role>` (`a2ui-text-field-input`); state a variant on the root
 * as a `data-` attribute.
 */
export type ComponentRenderer = (component: A2uiComponent, scope: SurfaceScope) => Element;
