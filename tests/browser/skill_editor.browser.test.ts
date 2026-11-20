import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

describe("the skill editor's full-panel view (real browser)", () => {
  const original = globalThis.fetch;

  beforeAll(() => {
    defineChat();
    globalThis.fetch = async (input) =>
      String(input).includes("/editor/") ? json({ skills: [] }) : json([]);
  });

  afterAll(() => {
    globalThis.fetch = original;
  });

  it("hides the transcript and composer in place, keeping the header and resize handles, and brings the same nodes back", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-skills-url", "/agent/skills/");
    el.setAttribute("data-skill-editor-url", "/agent/skills/editor/");
    document.body.append(el);
    await settle();
    const root = el.shadowRoot as ShadowRoot;
    const chat = root.querySelector(".chat") as HTMLElement;
    const hidden = () =>
      [...chat.children]
        .filter((child) => getComputedStyle(child).display === "none")
        .map((child) => child.className.split(" ")[0]);
    const transcript = root.querySelector(".messages-wrap") as HTMLElement;
    const before = hidden();

    el.openSkillEditor();
    await settle();
    const view = root.querySelector(".panel-view") as HTMLElement;
    expect(getComputedStyle(view).display).toBe("flex");
    expect(getComputedStyle(root.querySelector(".header") as HTMLElement).display).not.toBe("none");
    expect(getComputedStyle(transcript).display).toBe("none");
    expect(hidden()).toEqual(expect.arrayContaining(["messages-wrap", "input-row"]));
    expect(hidden()).not.toContain("resize-handle");
    expect(view.getBoundingClientRect().height).toBeGreaterThan(200);

    el.closeSkillEditor();
    await settle();
    expect(root.querySelector(".messages-wrap")).toBe(transcript);
    expect(transcript.isConnected).toBe(true);
    expect(getComputedStyle(view).display).toBe("none");
    expect(hidden()).toEqual(before);
    el.remove();
  });
});
