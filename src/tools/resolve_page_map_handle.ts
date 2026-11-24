import { ELEMENT_TAG_PREFIX } from "../constants.js";

/**
 * Resolve a page-map handle (or any selector) in the document, then in the
 * open shadow roots under it, skipping this package's own elements. The
 * default `resolvePageTarget` reaches the light DOM only; a handle that
 * {@link pageMapFrom} stamped inside a shadow root resolves here.
 */
export function resolvePageMapHandle(target: string): HTMLElement | null {
  return deepQuery(document, target);
}

function deepQuery(root: Document | ShadowRoot, target: string): HTMLElement | null {
  const hit = root.querySelector<HTMLElement>(target);
  if (hit !== null) {
    return hit;
  }
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot !== null && !el.localName.startsWith(ELEMENT_TAG_PREFIX)) {
      const deep = deepQuery(el.shadowRoot, target);
      if (deep !== null) {
        return deep;
      }
    }
  }
  return null;
}
