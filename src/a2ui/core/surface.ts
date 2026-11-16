import type { A2uiComponent } from "./a2ui_component.js";
import type { A2uiError } from "./a2ui_error.js";
import type { A2uiFunction } from "./a2ui_function.js";
import type { CheckFailure } from "./check_failure.js";
import type { ComponentRenderer } from "./component_renderer.js";
import { DataModel } from "./data_model.js";
import type { FunctionContext } from "./function_context.js";
import { joinPointer } from "./join_pointer.js";
import type { SurfaceScope } from "./surface_scope.js";
import { toValidationResult } from "./to_validation_result.js";
import type { UserAction } from "./user_action.js";

/** How a {@link Surface} is built: its catalog, and where its actions and errors go. */
export interface SurfaceOptions {
  readonly surfaceId: string;
  /** The catalog id the surface was created with; any other one on a component or call fails. */
  readonly catalogId: string;
  readonly components: Readonly<Record<string, ComponentRenderer>>;
  readonly functions: Readonly<Record<string, A2uiFunction>>;
  readonly live: boolean;
  readonly onAction: (action: UserAction) => void;
  /** Each distinct error once per surface, in the order it was found. */
  readonly onError: (error: A2uiError) => void;
}

interface Watcher {
  readonly evaluate: () => unknown;
  readonly apply: (value: unknown) => void;
  last: string;
}

/** The watchers one drawn subtree owns, and the subtrees drawn inside it. */
interface Bag {
  readonly watchers: Set<Watcher>;
  readonly bags: Set<Bag>;
}

interface Place {
  readonly base: string;
  readonly index: number | undefined;
  readonly bag: Bag;
  readonly ancestors: readonly string[];
}

/**
 * One A2UI surface: its components by id, its data model, and the DOM drawn
 * from them, kept current as the model changes.
 *
 * Components are drawn by the catalog's renderers through a
 * {@link SurfaceScope}; every bound value a renderer watches is re-evaluated
 * after each data model write and re-applied when it changed.
 */
export class Surface {
  readonly model: DataModel;
  readonly #options: SurfaceOptions;
  readonly #definitions = new Map<string, A2uiComponent>();
  readonly #watchers = new Set<Watcher>();
  readonly #reported = new Set<string>();
  #drawn: Bag | null = null;

  constructor(options: SurfaceOptions, model: DataModel = new DataModel()) {
    this.#options = options;
    this.model = model;
    model.subscribe(() => this.#refresh());
  }

  get surfaceId(): string {
    return this.#options.surfaceId;
  }

  /** Add or replace components by id, as `updateComponents` does. */
  define(components: unknown): void {
    if (!Array.isArray(components)) {
      this.report("VALIDATION_FAILED", "components must be an array", "/components");
      return;
    }
    for (const [i, component] of components.entries()) {
      if (isComponent(component)) {
        this.#definitions.set(component.id, component);
      } else {
        this.report(
          "VALIDATION_FAILED",
          "a component needs a string id and a string component",
          `/components/${i}`,
        );
      }
    }
  }

  /** Draw the tree from `root` into a new node, retiring the watchers of the last draw. */
  draw(): HTMLElement {
    this.dispose();
    const bag: Bag = { watchers: new Set(), bags: new Set() };
    this.#drawn = bag;
    const node = document.createElement("div");
    node.setAttribute("part", "a2ui-surface");
    node.dataset["a2uiSurface"] = this.surfaceId;
    node.append(this.#scope({ base: "", index: undefined, bag, ancestors: [] }).child("root"));
    return node;
  }

  /** Stop every watcher of the last draw. */
  dispose(): void {
    if (this.#drawn !== null) {
      this.#retire(this.#drawn);
      this.#drawn = null;
    }
  }

  /** Report an error to {@link SurfaceOptions.onError}, once per distinct code, message and path. */
  report(code: string, message: string, path?: string): void {
    const key = JSON.stringify([code, message, path]);
    if (this.#reported.has(key)) {
      return;
    }
    this.#reported.add(key);
    this.#options.onError({
      code,
      surfaceId: this.surfaceId,
      message,
      ...(path === undefined ? {} : { path }),
    });
  }

  #refresh(): void {
    for (const watcher of [...this.#watchers]) {
      if (this.#watchers.has(watcher)) {
        const value = watcher.evaluate();
        const key = keyOf(value);
        if (key !== watcher.last) {
          watcher.last = key;
          watcher.apply(value);
        }
      }
    }
  }

  #retire(bag: Bag): void {
    for (const watcher of bag.watchers) {
      this.#watchers.delete(watcher);
    }
    for (const inner of bag.bags) {
      this.#retire(inner);
    }
    bag.watchers.clear();
    bag.bags.clear();
  }

  #watch(place: Place, evaluate: () => unknown, apply: (value: unknown) => void): void {
    const value = evaluate();
    const watcher: Watcher = { evaluate, apply, last: keyOf(value) };
    this.#watchers.add(watcher);
    place.bag.watchers.add(watcher);
    apply(value);
  }

  #resolve(place: Place, value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.#resolve(place, item));
    }
    if (!isObject(value)) {
      return value;
    }
    if (Object.hasOwn(value, "@path")) {
      const path = value["@path"];
      return typeof path === "string" ? this.model.get(joinPointer(place.base, path)) : undefined;
    }
    if (Object.hasOwn(value, "@call")) {
      return this.#call(place, value, false, "EXPRESSION_ERROR");
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, this.#resolve(place, item)]),
    );
  }

  #call(
    place: Place,
    call: Readonly<Record<string, unknown>>,
    userActivation: boolean,
    code: string,
  ): unknown {
    const name = call["@call"];
    const catalogId = call["catalogId"];
    if (catalogId !== undefined && catalogId !== this.#options.catalogId) {
      this.report(code, `function catalog ${JSON.stringify(catalogId)} is not supported`);
      return null;
    }
    const raw = call["args"];
    const args = (isObject(raw) ? this.#resolve(place, raw) : {}) as Record<string, unknown>;
    if (name === "@index") {
      if (place.index === undefined) {
        this.report(code, "@index is only defined inside a list template");
        return null;
      }
      const offset = Number(args["offset"] ?? 0);
      return place.index + (Number.isFinite(offset) ? offset : 0);
    }
    const fn =
      typeof name === "string" && Object.hasOwn(this.#options.functions, name)
        ? this.#options.functions[name]
        : undefined;
    if (fn === undefined) {
      this.report(code, `unknown function ${JSON.stringify(name)}`);
      return null;
    }
    const context: FunctionContext = {
      read: (path) => this.model.get(joinPointer(place.base, path)),
      call: (inner, innerArgs) =>
        this.#call(place, { "@call": inner, args: innerArgs }, userActivation, code),
      userActivation,
    };
    try {
      return fn(args, context);
    } catch (error) {
      this.report(code, `${String(name)} failed: ${messageOf(error)}`);
      return null;
    }
  }

  #child(place: Place, id: unknown): Node {
    const definition = typeof id === "string" ? this.#definitions.get(id) : undefined;
    if (definition === undefined) {
      const placeholder = document.createElement("span");
      placeholder.setAttribute("part", "a2ui-placeholder");
      placeholder.hidden = true;
      return placeholder;
    }
    const type = definition.component;
    if (place.ancestors.includes(definition.id)) {
      this.report("VALIDATION_FAILED", `component ${definition.id} contains itself`, "/components");
      return notice(`${type} ${definition.id} contains itself.`);
    }
    const catalogId = definition["@catalogId"];
    const renderer =
      (catalogId === undefined || catalogId === this.#options.catalogId) &&
      Object.hasOwn(this.#options.components, type)
        ? this.#options.components[type]
        : undefined;
    if (renderer === undefined) {
      this.report(
        "VALIDATION_FAILED",
        `component type ${type} is not in the catalog`,
        "/components",
      );
      return notice(`This surface uses a ${type} component, which cannot be drawn here.`);
    }
    const inner: Place = { ...place, ancestors: [...place.ancestors, definition.id] };
    const element = renderer(definition, this.#scope(inner));
    this.#decorate(inner, element, definition);
    return element;
  }

  #decorate(place: Place, element: Element, definition: A2uiComponent): void {
    element.setAttribute("part", `a2ui-${kebab(definition.component)}`);
    element.setAttribute("data-a2ui-id", definition.id);
    const weight = definition["weight"];
    if (typeof weight === "number" && element instanceof HTMLElement) {
      element.style.flexGrow = String(weight);
    }
    const accessibility = definition["@accessibility"];
    if (!isObject(accessibility)) {
      return;
    }
    const attribute = (name: string, value: unknown): void => {
      if (value === undefined || value === null || value === "") {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, String(value));
      }
    };
    if (accessibility["label"] !== undefined) {
      this.#watch(
        place,
        () => this.#resolve(place, accessibility["label"]),
        (value) => {
          attribute("aria-label", value);
        },
      );
    }
    if (accessibility["description"] !== undefined) {
      this.#watch(
        place,
        () => this.#resolve(place, accessibility["description"]),
        (value) => {
          attribute("aria-description", value);
        },
      );
    }
    if (typeof accessibility["live"] === "string") {
      attribute("aria-live", accessibility["live"]);
    }
    if (accessibility["hidden"] !== undefined) {
      this.#watch(
        place,
        () => this.#resolve(place, accessibility["hidden"]),
        (value) => {
          attribute("aria-hidden", value === true ? "true" : undefined);
        },
      );
    }
  }

  #children(place: Place, list: unknown, container: Element): void {
    if (Array.isArray(list)) {
      for (const id of list) {
        container.append(this.#child(place, id));
      }
      return;
    }
    if (!isObject(list) || typeof list["path"] !== "string") {
      return;
    }
    const pointer = joinPointer(place.base, list["path"]);
    const componentId = list["componentId"];
    let items: Bag[] = [];
    this.#watch(
      place,
      () => {
        const value = this.model.get(pointer);
        return Array.isArray(value) ? value.length : 0;
      },
      (length) => {
        for (const bag of items) {
          this.#retire(bag);
          place.bag.bags.delete(bag);
        }
        items = [];
        container.replaceChildren();
        for (let index = 0; index < (length as number); index++) {
          const bag: Bag = { watchers: new Set(), bags: new Set() };
          place.bag.bags.add(bag);
          items.push(bag);
          const item: Place = { ...place, base: `${pointer}/${index}`, index, bag };
          container.append(this.#child(item, componentId));
        }
      },
    );
  }

  #checks(
    place: Place,
    component: A2uiComponent,
    apply: (failures: readonly CheckFailure[]) => void,
  ): void {
    const rules = component["@checks"];
    this.#watch(
      place,
      () =>
        (Array.isArray(rules) ? rules : []).flatMap((rule): CheckFailure[] => {
          if (!isObject(rule)) {
            return [];
          }
          const message = typeof rule["message"] === "string" ? rule["message"] : undefined;
          const result = toValidationResult(this.#resolve(place, rule["condition"]), message);
          if (result.valid) {
            return [];
          }
          return [
            {
              message: result.message ?? "",
              severity: result.severity,
              ...(result.code === undefined ? {} : { code: result.code }),
            },
          ];
        }),
      (failures) => apply(failures as CheckFailure[]),
    );
  }

  #act(place: Place, action: unknown, component: A2uiComponent): void {
    if (!this.#options.live || !isObject(action)) {
      return;
    }
    const event = action["event"];
    if (isObject(event)) {
      if (typeof event["name"] !== "string") {
        this.report("EXECUTION_ERROR", `the action of ${component.id} has no name`);
        return;
      }
      const userMessage =
        event["userMessage"] === undefined ? null : this.#resolve(place, event["userMessage"]);
      const context = isObject(event["context"]) ? this.#resolve(place, event["context"]) : {};
      this.#options.onAction({
        name: event["name"],
        surfaceId: this.surfaceId,
        sourceComponentId: component.id,
        timestamp: new Date().toISOString(),
        ...(userMessage === null || userMessage === undefined || userMessage === ""
          ? {}
          : { userMessage: String(userMessage) }),
        context: context as Record<string, unknown>,
      });
      return;
    }
    const call = action["functionCall"];
    if (isObject(call)) {
      this.#call(place, call, true, "EXECUTION_ERROR");
    }
  }

  #scope(place: Place): SurfaceScope {
    const live = this.#options.live;
    return {
      surfaceId: this.surfaceId,
      live,
      resolve: (value) => this.#resolve(place, value),
      watch: (value, apply) => this.#watch(place, () => this.#resolve(place, value), apply),
      write: (binding, value) => {
        if (live && isObject(binding) && typeof binding["@path"] === "string") {
          this.model.set(joinPointer(place.base, binding["@path"]), value);
        }
      },
      child: (id) => this.#child(place, id),
      children: (list, container) => this.#children(place, list, container),
      act: (action, component) => this.#act(place, action, component),
      checks: (component, apply) => this.#checks(place, component, apply),
    };
  }
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isComponent(value: unknown): value is A2uiComponent {
  return (
    isObject(value) && typeof value["id"] === "string" && typeof value["component"] === "string"
  );
}

function keyOf(value: unknown): string {
  return JSON.stringify(value) ?? "undefined";
}

function kebab(type: string): string {
  return type.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notice(text: string): HTMLElement {
  const element = document.createElement("div");
  element.setAttribute("part", "a2ui-notice");
  element.setAttribute("role", "note");
  element.textContent = text;
  return element;
}
