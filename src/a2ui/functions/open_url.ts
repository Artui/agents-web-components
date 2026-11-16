import type { A2uiFunction } from "../core/a2ui_function.js";
import { safeUrl } from "../safe_url.js";

/** `openUrl`: opens an http(s) URL in a new tab, only from a user gesture; otherwise throws. */
export const openUrl: A2uiFunction = (args, context) => {
  if (!context.userActivation) {
    throw new Error("openUrl needs a user gesture");
  }
  const href = safeUrl(args["url"]);
  if (href === null) {
    throw new Error("openUrl refused a URL that is not http or https");
  }
  window.open(href, "_blank", "noopener,noreferrer");
};
