import { afterEach, describe, expect, it } from "vitest";
import { drawSurface } from "./helpers/a2ui_surface.js";

afterEach(() => {
  document.body.replaceChildren();
});

// basic catalog v1, examples/child-list-template.json
const CHILD_LIST_TEMPLATE = [
  { id: "root", component: "Card", child: "main_column" },
  {
    id: "main_column",
    component: "Column",
    children: ["title_text", "item_list"],
    align: "stretch",
  },
  { id: "title_text", component: "Text", text: "### Dynamic Item List" },
  { id: "item_list", component: "List", children: { componentId: "item_row", path: "/items" } },
  { id: "item_row", component: "Row", children: ["item_name", "qty_label", "item_qty"] },
  { id: "item_name", component: "Text", text: { "@path": "name" } },
  { id: "qty_label", component: "Text", text: " - Qty: " },
  { id: "item_qty", component: "Text", text: { "@path": "quantity" } },
];
const ITEMS = {
  items: [
    { name: "Apple", quantity: 10 },
    { name: "Banana", quantity: 5 },
    { name: "Cherry", quantity: 20 },
  ],
};

function rows(list: HTMLElement): string[] {
  return [...list.children].map((row) =>
    [...row.children].map((cell) => cell.textContent?.trim()).join("|"),
  );
}

describe("Card, Column, List and Row", () => {
  it("draw the child-list template example, each item from its relative paths", () => {
    const drawn = drawSurface({ components: CHILD_LIST_TEMPLATE, data: ITEMS });
    const card = drawn.byId("root");
    expect(card.getAttribute("part")).toBe("a2ui-card");
    expect(card.children).toHaveLength(1);
    expect(card.firstElementChild?.getAttribute("data-a2ui-id")).toBe("main_column");
    const column = drawn.byId("main_column");
    expect(column.getAttribute("part")).toBe("a2ui-column");
    expect(column.dataset["align"]).toBe("stretch");
    expect(column.dataset["justify"]).toBe("start");
    const list = drawn.byId("item_list");
    expect(list.getAttribute("part")).toBe("a2ui-list");
    expect(list.dataset["direction"]).toBe("vertical");
    expect(list.dataset["align"]).toBe("stretch");
    // The example's " - Qty: " is markdown, so it draws as a one-item bullet list.
    expect(rows(list)).toEqual(["Apple|Qty:|10", "Banana|Qty:|5", "Cherry|Qty:|20"]);
    expect([...list.children].every((row) => row.getAttribute("part") === "a2ui-row")).toBe(true);
    expect(drawn.errors).toEqual([]);
  });

  it("redraw the list when an item changes or the array grows and shrinks", () => {
    const drawn = drawSurface({ components: CHILD_LIST_TEMPLATE, data: ITEMS });
    const list = drawn.byId("item_list");
    drawn.model.set("/items/1/name", "Blueberry");
    expect(rows(list)[1]).toBe("Blueberry|Qty:|5");
    drawn.model.set("/items/3", { name: "Date", quantity: 1 });
    expect(rows(list)).toHaveLength(4);
    expect(rows(list)[3]).toBe("Date|Qty:|1");
    drawn.model.set("/items", []);
    expect(rows(list)).toEqual([]);
  });

  it("state justify and align on the root, falling back for unknown values", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Column", children: ["row", "list"], justify: "spaceEvenly" },
        { id: "row", component: "Row", children: [], justify: "spaceBetween", align: "center" },
        { id: "list", component: "List", children: [], direction: "horizontal", align: "end" },
      ],
    });
    expect(drawn.byId("root").dataset["justify"]).toBe("spaceEvenly");
    expect(drawn.byId("row").dataset["justify"]).toBe("spaceBetween");
    expect(drawn.byId("row").dataset["align"]).toBe("center");
    expect(drawn.byId("list").dataset["direction"]).toBe("horizontal");
    expect(drawn.byId("list").dataset["align"]).toBe("end");
    const odd = drawSurface({
      components: [{ id: "root", component: "Row", children: [], justify: "middle", align: 3 }],
    }).byId("root");
    expect(odd.dataset["justify"]).toBe("start");
    expect(odd.dataset["align"]).toBe("stretch");
  });

  it("draw an unknown List direction as vertical and a Card without a child empty-handed", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Column", children: ["list", "card"] },
        { id: "list", component: "List", children: [], direction: "diagonal" },
        { id: "card", component: "Card" },
      ],
    });
    expect(drawn.byId("list").dataset["direction"]).toBe("vertical");
    expect(drawn.byId("card").querySelector('[part="a2ui-placeholder"]')).not.toBeNull();
  });
});

describe("Divider", () => {
  it("is a separator along its axis, horizontal by default", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["h", "v", "x"] },
        { id: "h", component: "Divider" },
        { id: "v", component: "Divider", axis: "vertical" },
        { id: "x", component: "Divider", axis: "diagonal" },
      ],
    });
    const h = drawn.byId("h");
    expect(h.tagName).toBe("HR");
    expect(h.getAttribute("part")).toBe("a2ui-divider");
    expect(h.dataset["axis"]).toBe("horizontal");
    expect(h.getAttribute("aria-orientation")).toBe("horizontal");
    expect(drawn.byId("v").dataset["axis"]).toBe("vertical");
    expect(drawn.byId("v").getAttribute("aria-orientation")).toBe("vertical");
    expect(drawn.byId("x").dataset["axis"]).toBe("horizontal");
  });
});
