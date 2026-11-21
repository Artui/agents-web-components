import { afterEach, describe, expect, it, vi } from "vitest";
import { displayMode } from "../src/mcp_apps/display_mode.js";
import type { McpAppsOverlay } from "../src/mcp_apps/types.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function view(overlay: McpAppsOverlay) {
  const node = document.createElement("div");
  const stage = document.createElement("div");
  const exit = document.createElement("button");
  exit.hidden = true;
  stage.append(exit);
  node.append(stage);
  document.body.append(node);
  const display = displayMode(node, stage, exit, overlay);
  const switched = vi.fn();
  display.onUserSwitch(switched);
  return { node, stage, exit, display, switched };
}

function press(target: EventTarget, key = "Escape"): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("displayMode", () => {
  it("shows only inline and fullscreen, answering anything else with the mode it is in", () => {
    const { stage, exit, display } = view({ exit: null });

    expect(display.request("pip")).toBe("inline");
    expect(display.request("inline")).toBe("inline");
    expect(display.request("fullscreen")).toBe("fullscreen");
    expect(display.request("fullscreen")).toBe("fullscreen");
    expect(display.request(42)).toBe("fullscreen");
    expect(stage.dataset["displayMode"]).toBe("fullscreen");
    expect(exit.hidden).toBe(false);
    expect(display.request("inline")).toBe("inline");
    expect(stage.dataset["displayMode"]).toBeUndefined();
    expect(exit.hidden).toBe(true);
  });

  it("returns a fullscreen view inline when a second view of the registration opens", () => {
    const overlay: McpAppsOverlay = { exit: null };
    const first = view(overlay);
    const second = view(overlay);

    first.display.request("fullscreen");
    second.display.request("fullscreen");

    expect(first.display.mode).toBe("inline");
    expect(first.switched).toHaveBeenCalledTimes(1);
    expect(second.display.mode).toBe("fullscreen");
    second.display.request("inline");
    expect(overlay.exit).toBeNull();
  });

  it("ignores a second fullscreen request while fullscreen: overlay, focus and mode stay put", () => {
    const overlay: McpAppsOverlay = { exit: null };
    const { exit, display, switched } = view(overlay);
    display.request("fullscreen");
    const held = overlay.exit;
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();

    expect(display.request("fullscreen")).toBe("fullscreen");

    expect(switched).not.toHaveBeenCalled();
    expect(overlay.exit).toBe(held);
    expect(exit.hidden).toBe(false);
    expect(document.activeElement).toBe(other);
    display.dispose();
  });

  it("leaves other keys alone, and takes Escape for itself only while fullscreen", () => {
    const { node, display, switched } = view({ exit: null });
    display.request("fullscreen");

    expect(press(node, "Enter").defaultPrevented).toBe(false);
    expect(display.mode).toBe("fullscreen");
    expect(press(node).defaultPrevented).toBe(true);
    expect(display.mode).toBe("inline");
    expect(press(node).defaultPrevented).toBe(false);
    expect(switched).toHaveBeenCalledTimes(1);
  });

  it("returns inline on dispose without telling the bridge, and keeps another view's overlay", () => {
    const overlay: McpAppsOverlay = { exit: null };
    const { node, display, switched } = view(overlay);
    view(overlay).display.dispose();
    display.request("fullscreen");
    expect(node.style.minHeight).not.toBe("");

    display.dispose();

    expect(display.mode).toBe("inline");
    expect(node.style.minHeight).toBe("");
    expect(overlay.exit).toBeNull();
    expect(switched).not.toHaveBeenCalled();
  });

  it("keeps the overlay of the view that took it over when an old one returns inline", () => {
    const overlay: McpAppsOverlay = { exit: null };
    const other = (): void => undefined;
    const { display } = view(overlay);
    display.request("fullscreen");
    overlay.exit = other;

    display.request("inline");

    expect(overlay.exit).toBe(other);
  });

  it("returns inline from its close control before any bridge listens", () => {
    const node = document.createElement("div");
    const stage = document.createElement("div");
    const exit = document.createElement("button");
    node.append(stage);
    document.body.append(node);
    const display = displayMode(node, stage, exit, { exit: null });
    display.request("fullscreen");

    exit.click();

    expect(display.mode).toBe("inline");
  });
});
