import { describe, expect, it, vi } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { ParentBreadcrumb } from "../src/ui/history/parent_breadcrumb.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

const PARENT: ThreadMeta = { threadId: "p", title: "Parent", updatedAt: 0, preview: "" };
const CHILD: ThreadMeta = {
  threadId: "c",
  title: "Child",
  updatedAt: 0,
  preview: "",
  parent: { threadId: "p", scope: null },
};

describe("ParentBreadcrumb", () => {
  it("opens the parent it shows", () => {
    const onOpen = vi.fn();
    const crumb = new ParentBreadcrumb(onOpen);
    crumb.show([PARENT, CHILD], "c", DEFAULT_UI_STRINGS);
    crumb.element.querySelector("button")?.click();
    expect(onOpen).toHaveBeenCalledWith({ threadId: "p", scope: null });
  });

  it("opens nothing once hidden, though its button is still in the tree", () => {
    const onOpen = vi.fn();
    const crumb = new ParentBreadcrumb(onOpen);
    crumb.show([PARENT, CHILD], "c", DEFAULT_UI_STRINGS);
    crumb.show([PARENT, CHILD], "p", DEFAULT_UI_STRINGS);
    expect(crumb.element.hidden).toBe(true);
    expect(crumb.element.textContent).toBe("");
    crumb.element.querySelector("button")?.click();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("is hidden for a thread the list does not hold", () => {
    const crumb = new ParentBreadcrumb(() => undefined);
    crumb.show([PARENT, CHILD], "elsewhere", DEFAULT_UI_STRINGS);
    expect(crumb.element.hidden).toBe(true);
  });
});
