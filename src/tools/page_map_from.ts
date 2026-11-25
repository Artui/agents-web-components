import {
  ELEMENT_TAG_PREFIX,
  PAGE_MAP_HANDLE_ATTRIBUTE,
  PAGE_MAP_IGNORE_ATTRIBUTE,
  PAGE_MAP_LIMITS,
  PAGE_MAP_TABLE_HEADER_LIMIT,
  PAGE_MAP_TEXT_LIMIT,
} from "../constants.js";
import type { PageMap } from "./page_map.js";

/** The kinds of entry {@link pageMapFrom} lists, each under its own key. */
export type PageMapKind = keyof typeof PAGE_MAP_LIMITS;

/** Options for {@link pageMapFrom}. */
export interface PageMapFromOptions {
  /** Per-kind caps replacing the defaults in `PAGE_MAP_LIMITS`. */
  readonly limits?: Partial<Record<PageMapKind, number>>;
}

type Fields = Record<string, string | number | boolean | readonly string[]>;

interface Found {
  readonly kind: PageMapKind;
  readonly element: Element;
  readonly fields: Fields;
}

const LANDMARK_ROLES = new Set([
  "banner",
  "complementary",
  "contentinfo",
  "form",
  "main",
  "navigation",
  "region",
  "search",
]);

const FIELD_ROLES = new Set([
  "checkbox",
  "combobox",
  "listbox",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "textbox",
]);

/** Input types that are buttons, not fields; their label is the value attribute. */
const BUTTON_INPUTS: Readonly<Record<string, string>> = {
  button: "",
  image: "",
  reset: "Reset",
  submit: "Submit",
};

/** Input types never listed: a password, and a value the user never sees. */
const UNLISTED_INPUTS = new Set(["hidden", "password"]);

/** Elements whose text is a value or not text at all, so a name never reads it. */
const SILENT_TAGS = new Set([
  "input",
  "noscript",
  "output",
  "script",
  "select",
  "style",
  "template",
  "textarea",
]);

const DIGITS = /^\d+$/;

const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

const SECTIONING = "article, aside, main, nav, section";

/** On the document, so a number is not reissued, by this copy of the walker or another. */
const NEXT_HANDLE = Symbol.for("agents-web-components.page-map.next-handle");

/**
 * A page map read from the live DOM: headings, landmarks, tabs, form fields,
 * buttons, links, table headers and open dialogs, each with a `handle` the
 * default `resolvePageTarget` resolves back to the element.
 *
 * Opt in with `chat.getPageMap = () => pageMapFrom()`. It reads what the page
 * says about its controls (labels, names, types, states such as required or
 * selected) and never what the user put in them: no field value, no password
 * or hidden input, no slider position, no editable text, no selected option,
 * and no query string of a link. It walks open shadow roots and skips the
 * subtree of every element of this package, of any element marked
 * `data-agent-ignore`, and of anything hidden, `inert` or `aria-hidden`. Of
 * the SVG elements only `<a>` links are listed; the HTML in a
 * `<foreignObject>` is listed as anywhere else.
 *
 * Each listed element is stamped with `data-agent-handle`; a handle is kept
 * across reads while its element is listed, and its number is not given out
 * again while the document lives. Each kind is capped (see
 * `PAGE_MAP_LIMITS`, overridable per call), and `truncated` counts what a cap
 * left out.
 */
export function pageMapFrom(
  root: ParentNode = document,
  options: PageMapFromOptions = {},
): PageMap {
  const limits = { ...PAGE_MAP_LIMITS, ...options.limits };
  const found: Found[] = [];
  const left: Partial<Record<PageMapKind, number>> = {};
  const counts: Partial<Record<PageMapKind, number>> = {};
  const add = (item: Found): void => {
    const count = counts[item.kind] ?? 0;
    counts[item.kind] = count + 1;
    if (count < limits[item.kind]) {
      found.push(item);
    } else {
      left[item.kind] = (left[item.kind] ?? 0) + 1;
    }
  };
  const top = root instanceof Element ? [root] : Array.from(root.children);
  for (const element of top) {
    walk(element, add);
  }

  const map: Record<string, Record<string, unknown>[]> = {};
  for (const { item, handle } of stamp(found)) {
    const list = map[item.kind] ?? [];
    list.push({ handle, ...item.fields });
    map[item.kind] = list;
  }
  return Object.keys(left).length === 0 ? map : { ...map, truncated: left };
}

function walk(element: Element, add: (item: Found) => void): void {
  if (
    !(element instanceof HTMLElement || element instanceof SVGElement) ||
    element.localName.startsWith(ELEMENT_TAG_PREFIX) ||
    element.hasAttribute(PAGE_MAP_IGNORE_ATTRIBUTE) ||
    (element instanceof HTMLElement && element.inert) ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return;
  }
  if (!rendered(element)) {
    if (getComputedStyle(element).display !== "contents") {
      return;
    }
  } else if (element.checkVisibility({ visibilityProperty: true })) {
    const item = element instanceof HTMLElement ? classify(element) : classifySvg(element);
    if (item !== null) {
      add(item);
      if (item.kind === "fields") {
        return;
      }
    }
  }
  for (const child of element.shadowRoot?.children ?? []) {
    walk(child, add);
  }
  for (const child of element.children) {
    walk(child, add);
  }
}

function classify(el: HTMLElement): Found | null {
  const role = explicitRole(el);
  const tag = el.localName;
  const found = (kind: PageMapKind, fields: Fields): Found => ({ kind, element: el, fields });
  // First, so an editable heading, tab or cell is a field and its text is never read.
  const field = fieldType(el, role);
  if (field !== null) {
    const name = el.getAttribute("name");
    return found("fields", {
      ...(name === null ? {} : { name }),
      type: field,
      ...named("label", fieldLabel(el)),
      ...flags(el),
    });
  }
  if (role === "heading" || (role === null && /^h[1-6]$/.test(tag))) {
    const level = Number(el.getAttribute("aria-level") ?? (role === null ? tag.slice(1) : "2"));
    return found("headings", { level, ...named("text", textOf(el)) });
  }
  if (role === "tab") {
    return found("tabs", {
      ...named("name", contentName(el)),
      selected: el.getAttribute("aria-selected") === "true",
      ...flags(el),
    });
  }
  if (role === "dialog" || role === "alertdialog" || (role === null && tag === "dialog")) {
    const modal = el.matches(":modal") || el.getAttribute("aria-modal") === "true";
    return found("dialogs", { ...named("name", labelName(el)), modal });
  }
  const landmark = landmarkRole(el, role);
  if (landmark !== null) {
    return found("landmarks", { role: landmark, ...named("name", labelName(el)) });
  }
  if (role === "table" || role === "grid" || (role === null && tag === "table")) {
    return found("tables", { ...named("name", labelName(el)), headers: headersOf(el) });
  }
  if (role === "button" || (role === null && isButton(el))) {
    return found("buttons", { ...named("name", buttonName(el)), ...flags(el) });
  }
  if (role === "link" || (role === null && tag === "a" && el.hasAttribute("href"))) {
    const href = el instanceof HTMLAnchorElement && el.hasAttribute("href") ? pathOf(el.href) : "";
    return found("links", { ...named("name", contentName(el)), ...named("href", href) });
  }
  return null;
}

/** An SVG element is listed only as a link: an `<a>` with a target, or with `role="link"`. */
function classifySvg(el: SVGElement): Found | null {
  const target = el.getAttribute("href") ?? el.getAttributeNS(XLINK_NAMESPACE, "href");
  const role = explicitRole(el);
  if (el.localName !== "a" || (role === null ? target === null : role !== "link")) {
    return null;
  }
  const href =
    target !== null && URL.canParse(target, el.baseURI)
      ? pathOf(new URL(target, el.baseURI).href)
      : "";
  const fields = { ...named("name", contentName(el)), ...named("href", href) };
  return { kind: "links", element: el, fields };
}

function explicitRole(el: Element): string | null {
  const [role] = (el.getAttribute("role") ?? "").trim().split(/\s+/);
  return role || null;
}

function landmarkRole(el: HTMLElement, role: string | null): string | null {
  if (role !== null) {
    return LANDMARK_ROLES.has(role) ? role : null;
  }
  switch (el.localName) {
    case "main":
      return "main";
    case "nav":
      return "navigation";
    case "aside":
      return "complementary";
    case "search":
      return "search";
    case "header":
      return el.parentElement?.closest(SECTIONING) ? null : "banner";
    case "footer":
      return el.parentElement?.closest(SECTIONING) ? null : "contentinfo";
    case "form":
      return labelName(el) === "" ? null : "form";
    case "section":
      return labelName(el) === "" ? null : "region";
    default:
      return null;
  }
}

function fieldType(el: HTMLElement, role: string | null): string | null {
  if (el instanceof HTMLInputElement) {
    return UNLISTED_INPUTS.has(el.type) || el.type in BUTTON_INPUTS ? null : el.type;
  }
  if (el instanceof HTMLTextAreaElement) {
    return "textarea";
  }
  if (el instanceof HTMLSelectElement) {
    return el.multiple ? "select-multiple" : "select";
  }
  if (role !== null && FIELD_ROLES.has(role)) {
    return role;
  }
  return el.isContentEditable ? "contenteditable" : null;
}

function isButton(el: HTMLElement): boolean {
  return (
    el instanceof HTMLButtonElement || (el instanceof HTMLInputElement && el.type in BUTTON_INPUTS)
  );
}

function flags(el: HTMLElement): Fields {
  const required = el.matches(":required") || el.getAttribute("aria-required") === "true";
  const disabled = el.matches(":disabled") || el.getAttribute("aria-disabled") === "true";
  return { ...(required ? { required } : {}), ...(disabled ? { disabled } : {}) };
}

function named(key: string, text: string): Fields {
  return text === "" ? {} : { [key]: text };
}

/** The name the page gives an element by reference or attribute, never by its content. */
function labelName(el: Element): string {
  const ids = el.getAttribute("aria-labelledby");
  if (ids !== null) {
    const scope = el.getRootNode() as Document | ShadowRoot;
    const text = ids
      .split(/\s+/)
      .map((id) => scope.getElementById(id))
      .map((ref) => (ref === null ? "" : textOf(ref)))
      .join(" ");
    if (text.trim() !== "") {
      return clip(text);
    }
  }
  const label = el.getAttribute("aria-label")?.trim() ?? "";
  if (label !== "") {
    return clip(label);
  }
  const caption = el instanceof HTMLTableElement ? el.caption : null;
  return clip(caption === null ? (el.getAttribute("title") ?? "") : textOf(caption));
}

function contentName(el: Element): string {
  return labelName(el) || textOf(el);
}

function buttonName(el: HTMLElement): string {
  if (el instanceof HTMLInputElement) {
    const label = labelName(el);
    if (label !== "") {
      return label;
    }
    const fallback =
      el.type === "image" ? (el.getAttribute("alt") ?? "") : (BUTTON_INPUTS[el.type] as string);
    return clip(el.getAttribute("value") ?? fallback);
  }
  return contentName(el);
}

function fieldLabel(el: HTMLElement): string {
  const label = labelName(el);
  if (label !== "") {
    return label;
  }
  const labels = "labels" in el ? (el.labels as NodeListOf<HTMLLabelElement> | null) : null;
  const text = clip(Array.from(labels ?? [], (l) => textOf(l)).join(" "));
  return text || clip(el.getAttribute("placeholder") ?? "");
}

function headersOf(table: HTMLElement): string[] {
  const head = table.querySelectorAll(":scope > thead th, [role=columnheader]");
  const cells =
    head.length > 0
      ? Array.from(head)
      : Array.from(table.querySelector(":scope > tbody > tr, :scope > tr")?.children ?? []).filter(
          (cell) => cell.localName === "th",
        );
  return cells
    .map((cell) => textOf(cell))
    .filter((text) => text !== "")
    .slice(0, PAGE_MAP_TABLE_HEADER_LIMIT);
}

/**
 * An element's rendered text: empty when the element itself is silent, and
 * without the silent parts under it.
 */
function textOf(node: Node): string {
  const parts: string[] = [];
  const visit = (current: Node): void => {
    if (current.nodeType === Node.TEXT_NODE) {
      parts.push(current.nodeValue as string);
      return;
    }
    if (!(current instanceof Element) || silent(current)) {
      return;
    }
    if (current.localName === "img") {
      parts.push(` ${current.getAttribute("alt") ?? ""} `);
      return;
    }
    const children =
      current instanceof HTMLSlotElement
        ? current.assignedNodes({ flatten: true })
        : childrenOf(current);
    for (const child of children) {
      visit(child);
    }
  };
  visit(node);
  return clip(parts.join(""));
}

/**
 * Whether a name never reads an element's text: a control or a value, an
 * editable region, this package's own element, an opt-out, or anything not
 * rendered (a display: contents wrapper, a slot among them, is still read).
 */
function silent(el: Element): boolean {
  return (
    SILENT_TAGS.has(el.localName) ||
    el.localName.startsWith(ELEMENT_TAG_PREFIX) ||
    el.hasAttribute(PAGE_MAP_IGNORE_ATTRIBUTE) ||
    el.getAttribute("aria-hidden") === "true" ||
    (el instanceof HTMLElement && el.isContentEditable) ||
    (!(el.checkVisibility({ visibilityProperty: true }) && rendered(el)) &&
      getComputedStyle(el).display !== "contents")
  );
}

/**
 * Whether the element is laid out. For SVG `checkVisibility` is not enough: Chromium
 * answers true under `<defs>`, `<symbol>` and a `display: none` group, which have no box.
 */
function rendered(el: Element): boolean {
  return el.checkVisibility() && (!(el instanceof SVGElement) || el.getClientRects().length > 0);
}

/** A node's children in the rendered tree: an open shadow root's in place of its own. */
function childrenOf(node: Node): NodeListOf<ChildNode> {
  return (node instanceof Element && node.shadowRoot !== null ? node.shadowRoot : node).childNodes;
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > PAGE_MAP_TEXT_LIMIT ? `${flat.slice(0, PAGE_MAP_TEXT_LIMIT - 1)}…` : flat;
}

/**
 * A link's target without its query or fragment, which may carry a token or an
 * id; for a scheme other than http(s) (mailto:, tel:, data:, ...) the scheme alone.
 */
function pathOf(href: string): string {
  const url = new URL(href, location.href);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return url.protocol;
  }
  return clip(url.origin === location.origin ? url.pathname : `${url.origin}${url.pathname}`);
}

/**
 * Stamps each listed element, keeping a handle it already has unless the
 * handle would resolve to another element first (a clone carries the stamp).
 */
function stamp(found: readonly Found[]): { readonly item: Found; readonly handle: string }[] {
  const select = (value: string): string => `[${PAGE_MAP_HANDLE_ATTRIBUTE}="${value}"]`;
  let next = (Reflect.get(document, NEXT_HANDLE) as number | undefined) ?? 0;
  for (const el of [
    ...document.querySelectorAll(`[${PAGE_MAP_HANDLE_ATTRIBUTE}]`),
    ...found.map(({ element }) => element),
  ]) {
    const value = el.getAttribute(PAGE_MAP_HANDLE_ATTRIBUTE) ?? "";
    if (DIGITS.test(value)) {
      next = Math.max(next, Number(value) + 1);
    }
  }
  const stamped = found.map((item) => {
    const { element } = item;
    const value = element.getAttribute(PAGE_MAP_HANDLE_ATTRIBUTE) ?? "";
    const scope = element.getRootNode() as Document | ShadowRoot;
    const own =
      DIGITS.test(value) &&
      scope.querySelector(select(value)) === element &&
      (scope === document || document.querySelector(select(value)) === null);
    const kept = own ? value : String(next++);
    element.setAttribute(PAGE_MAP_HANDLE_ATTRIBUTE, kept);
    return { item, handle: select(kept) };
  });
  Reflect.set(document, NEXT_HANDLE, next);
  return stamped;
}
