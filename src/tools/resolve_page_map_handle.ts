import { ELEMENT_TAG_PREFIX, PAGE_MAP_HANDLE_ATTRIBUTE } from "../constants.js";

const HANDLE = new RegExp(`^\\[${PAGE_MAP_HANDLE_ATTRIBUTE}="\\d+"\\]$`);

/**
 * The default `resolvePageTarget`: `document.querySelector(target)`, and only
 * when that misses and `target` is exactly a handle {@link pageMapFrom}
 * stamped (`[data-agent-handle="n"]`), a search of the open shadow roots under
 * the document, skipping this package's own elements. Any other selector
 * resolves in the light DOM alone, as it always has.
 */
export function resolvePageMapHandle(target: string): HTMLElement | null {
  const hit = document.querySelector<HTMLElement>(target);
  return hit === null && HANDLE.test(target) ? inShadowRoots(document, target) : hit;
}

function inShadowRoots(root: Document | ShadowRoot, target: string): HTMLElement | null {
  for (const el of root.querySelectorAll("*")) {
    if (el.shadowRoot !== null && !el.localName.startsWith(ELEMENT_TAG_PREFIX)) {
      const deep =
        el.shadowRoot.querySelector<HTMLElement>(target) ?? inShadowRoots(el.shadowRoot, target);
      if (deep !== null) {
        return deep;
      }
    }
  }
  return null;
}
