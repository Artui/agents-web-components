import { afterEach, describe, expect, it } from "vitest";
import { drawSurface } from "./helpers/a2ui_surface.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("Image", () => {
  it("draws the contact card example's avatar from a bound url", () => {
    // basic catalog v1, examples/contact-card.json
    const drawn = drawSurface({
      components: [
        {
          id: "root",
          component: "Image",
          url: { "@path": "/avatar" },
          fit: "cover",
          variant: "avatar",
        },
      ],
      data: { avatar: "https://example.com/a.png" },
    });
    const image = drawn.byId("root") as HTMLImageElement;
    expect(image.tagName).toBe("IMG");
    expect(image.getAttribute("part")).toBe("a2ui-image");
    expect(image.getAttribute("src")).toBe("https://example.com/a.png");
    expect(image.hidden).toBe(false);
    expect(image.dataset["fit"]).toBe("cover");
    expect(image.dataset["variant"]).toBe("avatar");
    expect(image.alt).toBe("");
    expect(image.referrerPolicy).toBe("no-referrer");
  });

  it("drops the source when the url turns unsafe, and takes it back when safe", () => {
    const drawn = drawSurface({
      components: [{ id: "root", component: "Image", url: { "@path": "/u" } }],
      data: { u: "https://example.com/1.png" },
    });
    const image = drawn.byId("root") as HTMLImageElement;
    drawn.model.set("/u", "javascript:alert(1)");
    expect(image.hasAttribute("src")).toBe(false);
    expect(image.hidden).toBe(true);
    drawn.model.set("/u", "https://example.com/2.png");
    expect(image.getAttribute("src")).toBe("https://example.com/2.png");
    expect(image.hidden).toBe(false);
  });

  it("treats the data scheme case-blind, whatever the URL helper hands back", () => {
    const drawn = drawSurface({
      components: [{ id: "root", component: "Image", url: "DATA:text/html,x" }],
    });
    expect(drawn.byId("root").hasAttribute("src")).toBe(false);
  });

  it("keeps a data url only for an image media type", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["png", "html", "none"] },
        { id: "png", component: "Image", url: "data:image/png;base64,iVBORw0KGgo=" },
        { id: "html", component: "Image", url: "data:text/html,<script>alert(1)</script>" },
        { id: "none", component: "Image" },
      ],
    });
    expect(drawn.byId("png").getAttribute("src")).toBe("data:image/png;base64,iVBORw0KGgo=");
    expect(drawn.byId("html").hasAttribute("src")).toBe(false);
    expect(drawn.byId("none").hasAttribute("src")).toBe(false);
  });

  it("takes its alt text from the description and its defaults from the variant", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["a", "b", "c"] },
        { id: "a", component: "Image", url: "https://e.com/a", description: { "@path": "/d" } },
        { id: "b", component: "Image", url: "https://e.com/b", variant: "header" },
        { id: "c", component: "Image", url: "https://e.com/c", variant: "poster", fit: "crop" },
      ],
      data: { d: "A cat" },
    });
    const a = drawn.byId("a") as HTMLImageElement;
    expect(a.alt).toBe("A cat");
    expect(a.dataset["variant"]).toBe("mediumFeature");
    expect(a.dataset["fit"]).toBe("fill");
    drawn.model.set("/d", 3);
    expect(a.alt).toBe("");
    expect(drawn.byId("b").dataset["fit"]).toBe("cover");
    expect(drawn.byId("c").dataset["variant"]).toBe("mediumFeature");
    expect(drawn.byId("c").dataset["fit"]).toBe("fill");
  });
});
