/**
 * Child sessions in the drawer: each under its parent's row, stepped in.
 *
 * A child nests only under a parent the drawer shows, so the list never hides
 * a row behind one it is not drawing, and every row is drawn exactly once,
 * even when the parents a malformed list names go round in a cycle.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { ThreadDrawer } from "../src/ui/history/thread_drawer.js";

const DAY = 24 * 60 * 60 * 1000;

function thread(id: string, updatedAt: number, parent?: string): ThreadMeta {
  const meta: ThreadMeta = { threadId: id, title: id, preview: `preview ${id}`, updatedAt };
  return parent === undefined ? meta : { ...meta, parent: { threadId: parent, scope: null } };
}

function build(): ThreadDrawer {
  const drawer = new ThreadDrawer({
    onSelect: () => undefined,
    onNew: () => undefined,
    onRename: () => undefined,
    onDelete: () => undefined,
  });
  document.body.appendChild(drawer.element);
  return drawer;
}

/** The list top to bottom: a heading as "# label", a row as its title, indented per nesting group. */
function outline(drawer: ThreadDrawer): string[] {
  const nodes = drawer.element.querySelectorAll<HTMLElement>(".drawer-group-label, .drawer-row");
  return [...nodes].map((node) => {
    if (node.classList.contains("drawer-group-label")) {
      return `# ${node.textContent ?? ""}`;
    }
    let depth = 0;
    for (let up = node.parentElement; up !== null; up = up.parentElement) {
      depth += up.classList.contains("drawer-children") ? 1 : 0;
    }
    return `${"  ".repeat(depth)}${node.querySelector(".drawer-row-title")?.textContent ?? ""}`;
  });
}

function filter(drawer: ThreadDrawer, query: string): void {
  const input = drawer.element.querySelector<HTMLInputElement>(".drawer-filter");
  if (input === null) {
    throw new Error("no filter");
  }
  input.value = query;
  input.dispatchEvent(new Event("input"));
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ThreadDrawer children", () => {
  it("draws a child under its parent, marked and stepped in", () => {
    const now = Date.now();
    const drawer = build();
    drawer.setThreads(
      [thread("child", now, "parent"), thread("other", now - 1), thread("parent", now - 2)],
      "",
    );
    expect(outline(drawer)).toEqual(["other", "parent", "  child"]);
    const child = [...drawer.element.querySelectorAll(".drawer-row")].at(-1);
    expect(child?.classList.contains("drawer-row--child")).toBe(true);
    expect(child?.getAttribute("part")).toBe("drawer-row drawer-row-child");
    const parent = drawer.element.querySelectorAll(".drawer-row")[1];
    expect(parent?.classList.contains("drawer-row--child")).toBe(false);
    expect(parent?.getAttribute("part")).toBe("drawer-row");
    expect(parent?.nextElementSibling?.getAttribute("part")).toBe("drawer-children");
    expect(child?.parentElement?.className).toBe("drawer-children");
  });

  it("keeps a child in its parent's date group, not its own", () => {
    const drawer = build();
    drawer.setThreads(
      [thread("child", Date.now(), "parent"), thread("parent", Date.now() - 30 * DAY)],
      "",
    );
    expect(outline(drawer)).toEqual(["parent", "  child"]);
    drawer.setThreads(
      [
        thread("today", Date.now()),
        thread("child", Date.now(), "parent"),
        thread("parent", Date.now() - 30 * DAY),
      ],
      "",
    );
    expect(outline(drawer)).toEqual(["# Today", "today", "# Older", "parent", "  child"]);
  });

  it("draws a parent's children in list order", () => {
    const now = Date.now();
    const drawer = build();
    drawer.setThreads(
      [
        thread("second", now, "parent"),
        thread("first", now - 1, "parent"),
        thread("parent", now - 2),
      ],
      "",
    );
    expect(outline(drawer)).toEqual(["parent", "  second", "  first"]);
    expect(drawer.element.querySelectorAll(".drawer-children")).toHaveLength(1);
  });

  it("steps a grandchild in twice", () => {
    const now = Date.now();
    const drawer = build();
    drawer.setThreads(
      [thread("grandchild", now, "child"), thread("child", now, "parent"), thread("parent", now)],
      "",
    );
    expect(outline(drawer)).toEqual(["parent", "  child", "    grandchild"]);
  });

  it("draws an orphan at the top level", () => {
    const now = Date.now();
    const drawer = build();
    drawer.setThreads([thread("orphan", now, "gone"), thread("plain", now - 1)], "");
    expect(outline(drawer)).toEqual(["orphan", "plain"]);
    expect(drawer.element.querySelector(".drawer-row--child")).toBeNull();
  });

  it("shows a child the filter matched alone, without its parent", () => {
    const now = Date.now();
    const drawer = build();
    const rows = [thread("needle-child", now, "parent"), thread("parent", now - 1)];
    for (let i = 0; i < 8; i += 1) {
      rows.push(thread(`filler-${i}`, now - 10 - i));
    }
    drawer.setThreads(rows, "");
    filter(drawer, "needle");
    expect(outline(drawer)).toEqual(["needle-child"]);
    filter(drawer, "parent");
    expect(outline(drawer)).toEqual(["parent"]);
  });

  it("draws each row of a cycle of parents once", () => {
    const now = Date.now();
    const drawer = build();
    drawer.setThreads(
      [thread("a", now, "b"), thread("b", now - 1, "a"), thread("self", now - 2, "self")],
      "",
    );
    expect(outline(drawer)).toEqual(["a", "  b", "self"]);
  });
});
