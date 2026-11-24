import { afterEach, describe, expect, it } from "vitest";
import { ThreadDrawer } from "../src/ui/history/thread_drawer.js";

afterEach(() => {
  document.body.replaceChildren();
});

describe("ThreadDrawer routine badge", () => {
  it("badges a routine's run with its name under the title, and leaves a typed thread bare", () => {
    const drawer = new ThreadDrawer({
      onSelect: () => undefined,
      onNew: () => undefined,
      onRename: () => undefined,
      onDelete: () => undefined,
    });
    document.body.appendChild(drawer.element);
    drawer.setThreads(
      [
        {
          threadId: "fired",
          title: "Standup",
          preview: "p",
          updatedAt: Date.now(),
          routine: { id: "1", name: "standup" },
        },
        { threadId: "typed", title: "Hello", preview: "p", updatedAt: Date.now() - 1 },
      ],
      "",
    );
    const badges = drawer.element.querySelectorAll<HTMLElement>("[part=drawer-row-routine]");
    expect(badges).toHaveLength(1);
    const [badge] = badges;
    expect(badge?.textContent).toBe("standup");
    expect(badge?.title).toBe("Run by the routine standup");
    expect(badge?.previousElementSibling?.className).toBe("drawer-row-title");
    expect(badge?.closest(".drawer-row-select")).not.toBeNull();
  });
});
