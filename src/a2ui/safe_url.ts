const HEAD = 64;

/**
 * `value` as a URL safe to load, else `null`: a URL whose scheme is in
 * `schemes`, or a same-host relative path resolved against the document.
 *
 * Follows the A2UI basic catalog's media URL rules: whitespace and control
 * characters trimmed, tab, CR and LF ignored while the scheme and leading
 * slashes are read, `http:` and `https:` only as `scheme://host`, a path
 * starting with two slashes (`\` counting as `/`) refused, and only the head
 * of the string inspected, so a `data:` URL comes back as given, unparsed.
 * Every URL the agent hands the renderer goes through this: the markdown
 * sanitiser guards HTML, not a URL set as a property.
 */
export function safeUrl(
  value: unknown,
  schemes: readonly string[] = ["https:", "http:"],
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  let start = 0;
  let end = value.length;
  while (start < end && value.charCodeAt(start) <= 0x20) {
    start++;
  }
  while (end > start && value.charCodeAt(end - 1) <= 0x20) {
    end--;
  }
  if (start === end) {
    return null;
  }
  let head = "";
  for (let i = start; i < end && head.length < HEAD; i++) {
    const char = value.charAt(i);
    if (char !== "\t" && char !== "\n" && char !== "\r") {
      head += char;
    }
  }
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(head)?.[1]?.toLowerCase();
  if (scheme === undefined) {
    const url = /^[/\\]{2}/.test(head) ? null : resolve(value.slice(start, end));
    return url?.origin === new URL(document.baseURI).origin ? url.href : null;
  }
  if (!schemes.includes(`${scheme}:`)) {
    return null;
  }
  if (scheme === "data") {
    return value.slice(start, end);
  }
  if ((scheme === "http" || scheme === "https") && !/^[a-z]+:[/\\]{2}[^/\\?#]/i.test(head)) {
    return null;
  }
  const url = resolve(value.slice(start, end));
  return url !== null && schemes.includes(url.protocol) ? url.href : null;
}

function resolve(url: string): URL | null {
  try {
    return new URL(url, document.baseURI);
  } catch {
    return null;
  }
}
