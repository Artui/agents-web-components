import type { UiStrings } from "../ui_strings.js";

/**
 * The sources an assistant message cites, drawn as a collapsed list under it.
 *
 * `value` is the message's `metadata.citations` as django-ag-ui 0.90.0 writes it
 * (pydantic-ai's `Citation` in its JSON form): a list of
 * `{ sources, anchor }`, each source `{ kind: "web", url, title, excerpts }` or
 * `{ kind: "document", document_id, title, excerpts }`, and the anchor
 * `{ kind: "content" | "marker", start, end }` or `null`. The live copy rides on
 * `TEXT_MESSAGE_END`, the stored copy on the message the thread endpoint
 * replays, and each indexes its own `content` in UTF-16 code units -- the two can
 * split differently (a file part between two texts streams as two messages and
 * is stored as one), so an anchor is only ever read against the text it came with.
 *
 * The anchored range is quoted under its sources rather than highlighted in the
 * bubble: the offsets count into the markdown source, and the rendered text is
 * shifted by every piece of markdown syntax before the range.
 *
 * Everything is narrowed off `unknown`, because a host store or another server
 * can hand back anything: a citation with no usable source is dropped, an anchor
 * that does not fit the text is dropped and its sources kept, and only an
 * `http(s)` URL becomes a link. Text goes in as text, never as HTML -- an
 * excerpt can carry a document's own words.
 *
 * Returns `null` when nothing survives, so a message without citations gets no
 * empty list.
 */
export function renderCitations(
  value: unknown,
  content: string,
  strings: CitationStrings,
): HTMLElement | null {
  const citations = citationsOf(value, content);
  if (citations.length === 0) {
    return null;
  }
  const details = document.createElement("details");
  details.className = "citations";
  details.setAttribute("part", "citations");
  const summary = document.createElement("summary");
  summary.className = "citations-summary";
  summary.textContent = strings.citations.replace("{count}", String(citations.length));
  const list = document.createElement("ol");
  list.className = "citation-list";
  for (const citation of citations) {
    list.append(citationItem(citation, strings));
  }
  details.append(summary, list);
  return details;
}

type CitationStrings = Pick<UiStrings, "citations" | "citationDocument">;

interface Source {
  readonly label: string;
  readonly href: string | null;
  readonly excerpts: readonly string[];
}

interface Citation {
  readonly sources: readonly Source[];
  readonly quote: { readonly kind: "content" | "marker"; readonly text: string } | null;
}

function citationItem(citation: Citation, strings: CitationStrings): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "citation";
  if (citation.quote !== null) {
    const quote = document.createElement(citation.quote.kind === "marker" ? "code" : "q");
    quote.className = `citation-anchor citation-anchor--${citation.quote.kind}`;
    quote.textContent = citation.quote.text;
    item.append(quote);
  }
  for (const source of citation.sources) {
    item.append(sourceLine(source, strings));
  }
  return item;
}

function sourceLine(source: Source, strings: CitationStrings): HTMLDivElement {
  const line = document.createElement("div");
  line.className = "citation-source";
  if (source.href === null) {
    const name = document.createElement("span");
    name.className = "citation-title";
    name.textContent = source.label === "" ? strings.citationDocument : source.label;
    line.append(name);
  } else {
    const link = document.createElement("a");
    link.className = "citation-title";
    link.href = source.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.label;
    line.append(link);
  }
  for (const excerpt of source.excerpts) {
    const quote = document.createElement("blockquote");
    quote.className = "citation-excerpt";
    quote.textContent = excerpt;
    line.append(quote);
  }
  return line;
}

function citationsOf(value: unknown, content: string): Citation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: Citation[] = [];
  for (const entry of value) {
    const record = recordOf(entry);
    const sources = Array.isArray(record?.["sources"])
      ? (record["sources"] as unknown[]).flatMap((source) => sourceOf(source) ?? [])
      : [];
    if (sources.length > 0) {
      out.push({ sources, quote: quoteOf(record?.["anchor"], content) });
    }
  }
  return out;
}

function sourceOf(value: unknown): Source | null {
  const record = recordOf(value);
  const title = stringOf(record?.["title"]);
  const excerpts = Array.isArray(record?.["excerpts"])
    ? (record["excerpts"] as unknown[]).filter(
        (excerpt): excerpt is string => typeof excerpt === "string" && excerpt.trim() !== "",
      )
    : [];
  if (record?.["kind"] === "web") {
    const url = stringOf(record["url"]);
    const href = httpUrl(url);
    if (url === "") {
      return null;
    }
    return { label: title === "" ? url : title, href, excerpts };
  }
  if (record?.["kind"] === "document") {
    return { label: title === "" ? stringOf(record["document_id"]) : title, href: null, excerpts };
  }
  return null;
}

function quoteOf(value: unknown, content: string): Citation["quote"] {
  const record = recordOf(value);
  const kind = record?.["kind"];
  const start = record?.["start"];
  const end = record?.["end"];
  if (
    (kind !== "content" && kind !== "marker") ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    (start as number) < 0 ||
    (start as number) >= (end as number) ||
    (end as number) > content.length
  ) {
    return null;
  }
  const text = content.slice(start as number, end as number).trim();
  return text === "" ? null : { kind, text };
}

function httpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
