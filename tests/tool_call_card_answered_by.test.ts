import { describe, expect, it } from "vitest";
import { ToolCallCard } from "../src/ui/progress/tool_call_card.js";
import { mergeUiStrings } from "../src/ui/ui_strings.js";

const mark = (card: ToolCallCard) =>
  card.element.querySelector<HTMLElement>(".tool-call-answered-by");

function settled(answeredBy?: unknown): ToolCallCard {
  const card = new ToolCallCard("book_flight", { seat: "12A" });
  card.settle("done", "ok", answeredBy);
  return card;
}

describe("ToolCallCard's answered-by mark", () => {
  it("marks a call a reviewer model approved", () => {
    const card = settled("reviewer:openai:gpt-5");

    expect(card.element.getAttribute("data-answered-by")).toBe("reviewer");
    expect(mark(card)?.textContent).toBe("Approved by a reviewer model");
    expect(mark(card)?.getAttribute("part")).toBe("tool-card-answered-by");
  });

  it("marks a call a routine approved", () => {
    const card = settled("routine:42");

    expect(card.element.getAttribute("data-answered-by")).toBe("routine");
    expect(mark(card)?.textContent).toBe("Approved by a routine");
  });

  it("reads the mark's words from the string table", () => {
    const strings = mergeUiStrings({ answeredByReviewer: "Vom Prüfmodell freigegeben" });
    const card = new ToolCallCard("book_flight", {}, undefined, strings);
    card.settle("done", "ok", "reviewer:m");

    expect(mark(card)?.textContent).toBe("Vom Prüfmodell freigegeben");
  });

  it.each([
    ["an unknown prefix", "oracle:x"],
    ["a prefix that only starts like a known one", "reviewers:m"],
    ["a bare prefix with no colon", "reviewer"],
    ["a known prefix with no colon after it", "reviewerX"],
    ["a prefix an object inherits", "constructor:x"],
    ["a value that is not a string", { answered_by: "reviewer:m" }],
    ["no value", undefined],
  ])("renders %s exactly as a card with no mark", (_label, value) => {
    expect(settled(value).element.outerHTML).toBe(settled().element.outerHTML);
  });

  it("keeps the first result's mark when a duplicate result arrives", () => {
    const card = settled("routine:42");
    card.settle("done", "ok", "reviewer:m");

    expect(card.element.getAttribute("data-answered-by")).toBe("routine");
    expect(card.element.querySelectorAll(".tool-call-answered-by")).toHaveLength(1);
  });

  it("marks a call whose result is blank", () => {
    const card = new ToolCallCard("book_flight", {});
    card.settle("done", "  ", "routine:42");

    expect(card.element.getAttribute("data-answered-by")).toBe("routine");
  });
});
