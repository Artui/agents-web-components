/**
 * What `renderEnqueuedMessages` draws from the `{ messages }` pydantic-ai's
 * adapter sends: a user bubble per user message with text, and nothing else.
 * Whether that text stays text in a real DOM is the Chromium project's
 * question (`tests/browser/recorded_wire_payload.browser.test.ts`).
 */

import { describe, expect, it } from "vitest";

import { renderEnqueuedMessages } from "../src/ui/transcript/enqueued_messages.js";

function bubbles(node: Node): string[] {
  const holder = document.createElement("div");
  holder.append(node);
  return [...holder.querySelectorAll(".message.message--user")].map((b) => b.textContent ?? "");
}

function drawsNothing(node: Node): boolean {
  return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !node.hasChildNodes();
}

describe("renderEnqueuedMessages", () => {
  it("draws a user message's string content as a user bubble, under the caption", () => {
    const node = renderEnqueuedMessages(
      { messages: [{ id: "u1", role: "user", content: "Compare with last week" }] },
      "Added during the run",
    ) as HTMLElement;

    expect(node.className).toBe("enqueued-messages");
    expect(node.getAttribute("part")).toBe("enqueued-messages");
    const bubble = node.querySelector(".message--user");
    expect(bubble?.getAttribute("part")).toBe("message message-user");
    expect(bubbles(node)).toEqual(["Compare with last week"]);
    const note = node.querySelector(".enqueued-messages-note");
    expect(note?.getAttribute("part")).toBe("enqueued-messages-note");
    expect(note?.textContent).toBe("Added during the run");
    // The caption comes after the bubbles it describes.
    expect(node.lastElementChild).toBe(note);
  });

  it("joins the text parts of a parts list, and skips every other part", () => {
    const node = renderEnqueuedMessages(
      {
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "First line" },
              { type: "binary", mimeType: "image/png", data: "AAAA" },
              { type: "text", text: 42 },
              "stray",
              { type: "text", text: "Second line" },
            ],
          },
        ],
      },
      "caption",
    );

    expect(bubbles(node)).toEqual(["First line\nSecond line"]);
  });

  it("draws one bubble per user message, in order, and none for anyone else", () => {
    const node = renderEnqueuedMessages(
      {
        messages: [
          { role: "user", content: "one" },
          { role: "assistant", content: "not drawn" },
          { role: "tool", content: "not drawn", toolCallId: "c1" },
          null,
          { role: "user", content: "two" },
        ],
      },
      "caption",
    );

    expect(bubbles(node)).toEqual(["one", "two"]);
  });

  it("draws nothing, by design, when no user message has any text", () => {
    for (const content of [
      { messages: [{ role: "assistant", content: "hello" }] },
      { messages: [{ role: "user", content: "   " }] },
      { messages: [{ role: "user", content: [{ type: "binary", data: "AAAA" }] }] },
      { messages: [{ role: "user" }] },
      { messages: [] },
      { messages: "not a list" },
      {},
      null,
      "text",
    ]) {
      expect(drawsNothing(renderEnqueuedMessages(content, "caption"))).toBe(true);
    }
  });
});
