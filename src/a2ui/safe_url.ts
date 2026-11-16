/**
 * `value` as an absolute URL when it is a string whose scheme is in
 * `schemes`, else `null`. Relative URLs resolve against the document's base.
 * Every URL the agent hands the renderer (an image's source, a link
 * `openUrl` opens) goes through this: the markdown sanitiser guards HTML, not
 * a URL set as a property.
 */
export function safeUrl(
  value: unknown,
  schemes: readonly string[] = ["https:", "http:"],
): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value.trim(), document.baseURI);
  } catch {
    return null;
  }
  return schemes.includes(url.protocol) ? url.href : null;
}
