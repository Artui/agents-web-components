import { afterEach, describe, expect, it } from "vitest";
import { ICON_GLYPHS } from "../src/a2ui/display/icon_glyphs.js";
import { drawSurface } from "./helpers/a2ui_surface.js";

afterEach(() => {
  document.body.replaceChildren();
});

// basic catalog v1, components.Icon.properties.name.oneOf[0].enum
const CATALOG_NAMES = [
  "accountCircle",
  "add",
  "arrowBack",
  "arrowForward",
  "attachFile",
  "calendarToday",
  "call",
  "camera",
  "check",
  "close",
  "delete",
  "download",
  "edit",
  "event",
  "error",
  "fastForward",
  "favorite",
  "favoriteOff",
  "folder",
  "help",
  "home",
  "info",
  "locationOn",
  "lock",
  "lockOpen",
  "mail",
  "menu",
  "moreVert",
  "moreHoriz",
  "notificationsOff",
  "notifications",
  "pause",
  "payment",
  "person",
  "phone",
  "photo",
  "play",
  "print",
  "refresh",
  "rewind",
  "search",
  "send",
  "settings",
  "share",
  "shoppingCart",
  "skipNext",
  "skipPrevious",
  "star",
  "starHalf",
  "starOff",
  "stop",
  "upload",
  "visibility",
  "visibilityOff",
  "volumeDown",
  "volumeMute",
  "volumeOff",
  "volumeUp",
  "warning",
];

function pathOf(element: HTMLElement): string | null {
  return element.querySelector("svg path")?.getAttribute("d") ?? null;
}

describe("Icon", () => {
  it("has a glyph for each of the catalog's 59 names and no other", () => {
    expect(CATALOG_NAMES).toHaveLength(59);
    expect(Object.keys(ICON_GLYPHS).sort()).toEqual([...CATALOG_NAMES].sort());
  });

  it("draws every catalog name as its glyph", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: CATALOG_NAMES },
        ...CATALOG_NAMES.map((name) => ({ id: name, component: "Icon", name })),
      ],
    });
    for (const name of CATALOG_NAMES) {
      const icon = drawn.byId(name);
      expect(icon.getAttribute("part")).toBe("a2ui-icon");
      expect(pathOf(icon)).toBe(ICON_GLYPHS[name]);
      expect(icon.querySelector("svg")?.getAttribute("viewBox")).toBe("0 -960 960 960");
    }
    expect(drawn.errors).toEqual([]);
  });

  it("draws the contact card example's icon and follows a bound name", () => {
    const drawn = drawSurface({
      components: [{ id: "root", component: "Icon", name: { "@path": "/icon" } }],
      data: { icon: "phone" },
    });
    const icon = drawn.byId("root");
    expect(pathOf(icon)).toBe(ICON_GLYPHS["phone"]);
    drawn.model.set("/icon", "location_on");
    expect(pathOf(icon)).toBe(ICON_GLYPHS["locationOn"]);
    expect(icon.hasAttribute("data-unknown")).toBe(false);
  });

  it("draws an empty glyph for an unknown name, without throwing", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["a", "b", "c"] },
        { id: "a", component: "Icon", name: "rocketLaunch" },
        { id: "b", component: "Icon", name: "constructor" },
        { id: "c", component: "Icon", name: 7 },
      ],
    });
    for (const id of ["a", "b", "c"]) {
      expect(pathOf(drawn.byId(id))).toBeNull();
      expect(drawn.byId(id).hasAttribute("data-unknown")).toBe(true);
    }
    expect(drawn.errors).toEqual([]);
  });

  it("draws an svgPath in a 24 unit box, bound or literal", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["a", "b"] },
        { id: "a", component: "Icon", name: { svgPath: "M0 0h24v24H0z" } },
        { id: "b", component: "Icon", name: { svgPath: { "@path": "/p" } } },
      ],
      data: { p: "M12 2l10 20H2z" },
    });
    expect(pathOf(drawn.byId("a"))).toBe("M0 0h24v24H0z");
    expect(drawn.byId("a").querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(pathOf(drawn.byId("b"))).toBe("M12 2l10 20H2z");
    drawn.model.set("/p", 5);
    expect(pathOf(drawn.byId("b"))).toBeNull();
  });

  it("is hidden from assistive technology unless it is labelled", () => {
    const drawn = drawSurface({
      components: [
        { id: "root", component: "Row", children: ["plain", "named"] },
        { id: "plain", component: "Icon", name: "add" },
        { id: "named", component: "Icon", name: "add", "@accessibility": { label: "Add" } },
      ],
    });
    expect(drawn.byId("plain").getAttribute("aria-hidden")).toBe("true");
    expect(drawn.byId("plain").hasAttribute("role")).toBe(false);
    expect(drawn.byId("named").getAttribute("role")).toBe("img");
    expect(drawn.byId("named").getAttribute("aria-label")).toBe("Add");
    expect(drawn.byId("named").hasAttribute("aria-hidden")).toBe(false);
    expect(drawn.byId("named").querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
