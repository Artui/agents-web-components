import type { ComponentRenderer } from "../core/component_renderer.js";
import { safeUrl } from "../safe_url.js";
import { choice } from "./utils.js";

const VARIANTS = ["icon", "avatar", "smallFeature", "mediumFeature", "largeFeature", "header"];
const FITS = ["contain", "cover", "fill", "none", "scaleDown"];

/**
 * Image: `url` when it is http, https, an image data URL or a relative path on
 * the page's own host, else no source at all and the element hidden, so
 * nothing the agent names outside that list loads.
 */
export const renderImage: ComponentRenderer = (component, scope) => {
  const element = document.createElement("img");
  const variant = choice(component["variant"], VARIANTS, "mediumFeature");
  element.dataset["variant"] = variant;
  element.dataset["fit"] = choice(component["fit"], FITS, variant === "header" ? "cover" : "fill");
  element.alt = "";
  element.decoding = "async";
  element.referrerPolicy = "no-referrer";
  scope.watch(component["url"], (value) => {
    const href = imageUrl(value);
    element.hidden = href === null;
    if (href === null) {
      element.removeAttribute("src");
    } else {
      element.src = href;
    }
  });
  scope.watch(component["description"], (value) => {
    element.alt = typeof value === "string" ? value : "";
  });
  return element;
};

function imageUrl(value: unknown): string | null {
  const href = safeUrl(value, ["https:", "http:", "data:"]);
  return href !== null && /^data:/i.test(href) && !/^data:image\//i.test(href) ? null : href;
}
