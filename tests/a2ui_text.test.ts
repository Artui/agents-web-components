import { afterEach, describe, expect, it } from "vitest";
import { drawSurface } from "./helpers/a2ui_surface.js";

afterEach(() => {
  document.body.replaceChildren();
});

// basic catalog v1, examples/markdown-text.json
const MARKDOWN_TEXT = [
  { id: "root", component: "Card", child: "main_column" },
  {
    id: "main_column",
    component: "Column",
    children: ["title_text", "markdown_content"],
    align: "stretch",
  },
  { id: "title_text", component: "Text", text: "### Markdown Rendering" },
  {
    id: "markdown_content",
    component: "Text",
    text: "# Heading 1\n\nThis is **bold** text and *italic* text.\n\n- List item 1\n- List item 2",
  },
];

describe("Text", () => {
  it("draws the markdown example's text through the markdown renderer", () => {
    const drawn = drawSurface({ components: MARKDOWN_TEXT });
    const title = drawn.byId("title_text");
    expect(title.getAttribute("part")).toBe("a2ui-text");
    expect(title.tagName).toBe("DIV");
    expect(title.dataset["variant"]).toBe("body");
    expect(title.textContent).toBe("Markdown Rendering");
    expect(drawn.byId("markdown_content").textContent).toContain("List item 2");
    expect(drawn.byId("markdown_content").textContent).not.toContain("**");
    expect(drawn.errors).toEqual([]);
  });

  it("states the caption variant and falls back to body for an unknown one", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Column", children: ["a", "b"] },
        { id: "a", component: "Text", text: "small", variant: "caption" },
        { id: "b", component: "Text", text: "h1?", variant: "h1" },
      ],
    });
    expect(drawn.byId("a").dataset["variant"]).toBe("caption");
    expect(drawn.byId("b").dataset["variant"]).toBe("body");
  });

  it("follows a bound value, drawing numbers as text and nothing for a missing value", () => {
    const drawn = drawSurface({
      components: [{ id: "root", component: "Text", text: { "@path": "/count" } }],
      data: { count: 10 },
    });
    expect(drawn.byId("root").textContent).toBe("10");
    drawn.model.set("/count", "eleven");
    expect(drawn.byId("root").textContent).toBe("eleven");
    drawn.model.set("/count", null);
    expect(drawn.byId("root").textContent).toBe("");
    drawn.model.set("/count", true);
    expect(drawn.byId("root").textContent).toBe("true");
    drawn.model.set("/count", { nested: 1 });
    expect(drawn.byId("root").textContent).toBe("");
  });
});
