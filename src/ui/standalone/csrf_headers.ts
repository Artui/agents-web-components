/**
 * The CSRF header an editor element's own attributes name: `data-csrf-token`
 * (the token itself), else the cookie `data-csrf-cookie` names, read at the
 * moment of the request so a rotated token goes with it; sent as
 * `data-csrf-header`, `X-CSRFToken` (Django's) by default. Empty when neither
 * attribute gives a token.
 */
export function csrfHeaders(element: Element): Record<string, string> {
  const token = element.getAttribute("data-csrf-token") || readCookie(element);
  if (!token) {
    return {};
  }
  return { [element.getAttribute("data-csrf-header") || "X-CSRFToken"]: token };
}

function readCookie(element: Element): string {
  const name = element.getAttribute("data-csrf-cookie");
  if (!name) {
    return "";
  }
  for (const pair of document.cookie.split(";")) {
    const at = pair.indexOf("=");
    if (at > 0 && pair.slice(0, at).trim() === name) {
      return decodeURIComponent(pair.slice(at + 1).trim());
    }
  }
  return "";
}
