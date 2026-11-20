import { describe, expect, it, vi } from "vitest";
import { PanelView } from "../src/ui/shell/panel_view.js";

type Part = "back" | "title" | "sub" | "actions" | "body" | "footer" | "status";

function parts(view: PanelView): Record<Part, HTMLElement> {
  const get = (s: string) => view.element.querySelector(s) as HTMLElement;
  return {
    back: get(".header-btn--back"),
    title: get(".panel-view-title"),
    sub: get(".panel-view-sub"),
    actions: get(".panel-view-actions"),
    body: get(".panel-view-body"),
    footer: get(".panel-view-footer"),
    status: get(".panel-view-status"),
  };
}

describe("PanelView", () => {
  it("starts hidden, a labelled region with its parts", () => {
    const view = new PanelView(
      () => "Back",
      () => {},
    );
    expect(view.isOpen).toBe(false);
    expect(view.element.getAttribute("part")).toBe("panel-view");
    expect(view.element.getAttribute("role")).toBe("region");
  });

  it("shows a screen whole, reading the back label anew each time", () => {
    let label = "Back";
    const view = new PanelView(
      () => label,
      () => {},
    );
    document.body.append(view.element);
    const action = document.createElement("button");
    view.show({
      title: "Skills",
      sub: "2",
      actions: [action],
      body: [document.createTextNode("rows")],
      footer: [document.createTextNode("foot")],
    });
    const p = parts(view);
    expect(view.isOpen).toBe(true);
    expect([p.title?.textContent, p.sub?.textContent, p.sub?.hidden]).toEqual([
      "Skills",
      "2",
      false,
    ]);
    expect(p.actions?.firstChild).toBe(action);
    expect([p.body?.textContent, p.footer?.textContent, p.footer?.hidden]).toEqual([
      "rows",
      "foot",
      false,
    ]);
    expect(view.element.getAttribute("aria-label")).toBe("Skills");
    expect(document.activeElement).toBe(p.back);

    view.announce("Saved");
    label = "Zurück";
    view.show({ title: "Edit", body: [] });
    expect([p.sub?.hidden, p.footer?.hidden, p.status?.textContent]).toEqual([true, true, ""]);
    expect(p.back?.getAttribute("aria-label")).toBe("Zurück");
    view.element.remove();
  });

  it("goes back on the arrow and on Escape, keeping Escape from the host", () => {
    const onBack = vi.fn();
    const view = new PanelView(() => "Back", onBack);
    const host = vi.fn();
    const wrap = document.createElement("div");
    wrap.addEventListener("keydown", host);
    wrap.append(view.element);
    parts(view).back?.click();
    view.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    view.element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(onBack).toHaveBeenCalledTimes(2);
    expect(host).toHaveBeenCalledOnce();
  });

  it("closes to empty", () => {
    const view = new PanelView(
      () => "Back",
      () => {},
    );
    view.show({ title: "Skills", body: [document.createTextNode("x")], footer: [] });
    view.announce("Saved");
    view.close();
    const p = parts(view);
    expect(view.isOpen).toBe(false);
    expect([p.body?.textContent, p.status?.textContent]).toEqual(["", ""]);
  });
});
