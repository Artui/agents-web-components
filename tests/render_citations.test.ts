import { describe, expect, it } from "vitest";
import { renderCitations } from "../src/ui/transcript/render_citations.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

const WEB = { kind: "web", url: "https://example.com/a", title: "A", excerpts: [] };

function drawn(value: unknown, content = "it is blue"): HTMLElement | null {
  return renderCitations(value, content, DEFAULT_UI_STRINGS);
}

function titles(value: unknown, content?: string): (string | null)[] {
  const list = drawn(value, content);
  return Array.from(list?.querySelectorAll(".citation-title") ?? []).map((t) => t.textContent);
}

function quotes(value: unknown, content?: string): (string | null)[] {
  const list = drawn(value, content);
  return Array.from(list?.querySelectorAll(".citation-anchor") ?? []).map((q) => q.textContent);
}

describe("renderCitations", () => {
  it("draws nothing for a message without citations", () => {
    for (const value of [undefined, null, "x", {}, [], [null], [{ sources: "x" }]]) {
      expect(drawn(value)).toBeNull();
    }
  });

  it("drops a citation none of whose sources it can name", () => {
    const value = [
      { sources: [{ kind: "web", url: "" }, { kind: "video", url: "x" }, "x"], anchor: null },
      { sources: [WEB], anchor: null },
    ];

    expect(drawn(value)?.querySelectorAll(".citation")).toHaveLength(1);
  });

  it("names a web source by its title, else its URL", () => {
    const value = [{ sources: [WEB, { ...WEB, title: null }], anchor: null }];

    expect(titles(value)).toEqual(["A", "https://example.com/a"]);
  });

  it("links only an http(s) URL", () => {
    const value = [
      {
        sources: [
          { ...WEB, url: "javascript:alert(1)", title: "J" },
          { ...WEB, url: "not a url", title: "N" },
          { ...WEB, url: "http://example.com/b", title: "H" },
        ],
        anchor: null,
      },
    ];

    const list = drawn(value);
    expect(Array.from(list?.querySelectorAll("a") ?? []).map((a) => a.textContent)).toEqual(["H"]);
    expect(
      Array.from(list?.querySelectorAll("span.citation-title") ?? []).map((s) => s.textContent),
    ).toEqual(["J", "N"]);
  });

  it("names a document by its title, else its id, else a generic label", () => {
    const value = [
      {
        sources: [
          { kind: "document", document_id: "d1", title: "Notes", excerpts: [] },
          { kind: "document", document_id: "d1", title: null, excerpts: [] },
          { kind: "document", document_id: null, title: null },
        ],
        anchor: null,
      },
    ];

    expect(titles(value)).toEqual(["Notes", "d1", "Document"]);
  });

  it("keeps a source's text excerpts and skips the rest", () => {
    const value = [{ sources: [{ ...WEB, excerpts: ["one", "", 3, "two"] }], anchor: null }];

    const excerpts = drawn(value)?.querySelectorAll(".citation-excerpt") ?? [];
    expect(Array.from(excerpts).map((e) => e.textContent)).toEqual(["one", "two"]);
  });

  it("quotes an anchor that fits the text and drops one that does not, keeping its sources", () => {
    const anchors = [
      { kind: "content", start: 6, end: 10 },
      { kind: "marker", start: 0, end: 2 },
      { kind: "content", start: 6, end: 11 },
      { kind: "content", start: -1, end: 2 },
      { kind: "content", start: 4, end: 4 },
      { kind: "content", start: 1.5, end: 4 },
      { kind: "content", start: 0, end: "2" },
      { kind: "content", start: 2, end: 3 },
      { kind: "other", start: 0, end: 2 },
      "x",
    ];
    const value = anchors.map((anchor) => ({ sources: [WEB], anchor }));

    expect(quotes(value)).toEqual(["blue", "it"]);
    expect(drawn(value)?.querySelectorAll(".citation")).toHaveLength(anchors.length);
  });

  it("counts the citations it draws in the summary", () => {
    const value = [
      { sources: [WEB], anchor: null },
      { sources: [WEB], anchor: null },
    ];

    expect(drawn(value)?.querySelector("summary")?.textContent).toBe("Sources (2)");
    expect(drawn(value)?.getAttribute("part")).toBe("citations");
  });
});
