/**
 * The registry's own contract for a renderer that returns an empty fragment:
 * nothing to draw, by design. Driven against a bare host, so what is asserted
 * is whether the registry opened a group or touched the transcript at all,
 * which an element-level run cannot see past its own pending indicator.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityRegistry } from "../src/core/activity_registry.js";

function host() {
  const group = document.createElement("div");
  return {
    group,
    ensureGroup: vi.fn(() => group),
    afterTranscriptGrew: vi.fn(),
    appendNotice: vi.fn(),
  };
}

const drawn = (): HTMLElement => {
  const node = document.createElement("div");
  node.className = "drawn";
  return node;
};

describe("a renderer that returns an empty fragment", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("opens no group, grows nothing and says nothing", () => {
    const h = host();
    const registry = new ActivityRegistry(h);
    registry.register({ type: "quiet", render: () => document.createDocumentFragment() });

    registry.draw("q1", "quiet", {}, true);

    expect(h.ensureGroup).not.toHaveBeenCalled();
    expect(h.afterTranscriptGrew).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(registry.unhandledTypes()).toEqual([]);
  });

  it("takes away what the same id drew before, silently", () => {
    const h = host();
    const registry = new ActivityRegistry(h);
    let quiet = false;
    registry.register({
      type: "sometimes",
      render: () => (quiet ? document.createDocumentFragment() : drawn()),
    });
    registry.draw("s1", "sometimes", {}, true);
    expect(h.group.querySelectorAll(".drawn")).toHaveLength(1);

    quiet = true;
    registry.draw("s1", "sometimes", {}, true);
    expect(h.group.querySelectorAll(".drawn")).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
    expect(h.appendNotice).not.toHaveBeenCalled();

    // And a later draw under the id starts again rather than replacing a node
    // that is no longer there.
    quiet = false;
    registry.draw("s1", "sometimes", {}, true);
    expect(h.group.querySelectorAll(".drawn")).toHaveLength(1);
  });

  it("can be drawn again under the same id", () => {
    const h = host();
    const registry = new ActivityRegistry(h);
    registry.register({ type: "quiet", render: () => document.createDocumentFragment() });

    registry.draw("q1", "quiet", {}, true);
    expect(() => registry.draw("q1", "quiet", {}, true)).not.toThrow();
    expect(h.ensureGroup).not.toHaveBeenCalled();
  });

  it("is told it is the first draw each time, having left nothing on screen", () => {
    const h = host();
    const registry = new ActivityRegistry(h);
    const previous: (Node | null)[] = [];
    registry.register({
      type: "quiet",
      render: (_content, context) => {
        previous.push(context.previous);
        return document.createDocumentFragment();
      },
    });

    registry.draw("q1", "quiet", {}, true);
    registry.draw("q1", "quiet", {}, true);
    expect(previous).toEqual([null, null]);
  });

  it("still draws a fragment that holds something, as before", () => {
    const h = host();
    const registry = new ActivityRegistry(h);
    registry.register({
      type: "full",
      render: () => {
        const fragment = document.createDocumentFragment();
        fragment.append(drawn());
        return fragment;
      },
    });

    registry.draw("f1", "full", {}, true);
    expect(h.group.querySelectorAll(".drawn")).toHaveLength(1);
  });

  it("replaces a redrawn fragment, handing the renderer what is on screen as previous", () => {
    const h = host();
    document.body.append(h.group);
    const registry = new ActivityRegistry(h);
    const seen: (boolean | null)[] = [];
    let text = "first";
    registry.register({
      type: "full",
      render: (_content, context) => {
        seen.push(context.previous === null ? null : context.previous.isConnected);
        const fragment = document.createDocumentFragment();
        const one = drawn();
        one.textContent = `${text} a`;
        const two = drawn();
        two.textContent = `${text} b`;
        fragment.append(one, two);
        return fragment;
      },
    });

    registry.draw("f1", "full", {}, true);
    text = "second";
    expect(() => registry.draw("f1", "full", {}, true)).not.toThrow();

    expect(seen).toEqual([null, true]);
    expect([...h.group.querySelectorAll(".drawn")].map((n) => n.textContent)).toEqual([
      "second a",
      "second b",
    ]);
  });

  it("takes away a fragment's content when the same id then draws nothing", () => {
    const h = host();
    const registry = new ActivityRegistry(h);
    let quiet = false;
    registry.register({
      type: "sometimes",
      render: () => {
        const fragment = document.createDocumentFragment();
        if (!quiet) {
          fragment.append(drawn());
        }
        return fragment;
      },
    });
    registry.draw("s1", "sometimes", {}, true);
    quiet = true;
    registry.draw("s1", "sometimes", {}, true);

    expect(h.group.querySelectorAll(".drawn")).toHaveLength(0);
    expect(h.group.children).toHaveLength(0);
  });
});
