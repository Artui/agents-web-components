import { describe, expect, it } from "vitest";
import {
  childSessionMessage,
  messageOrigin,
  renderChildSessionMessage,
} from "../src/ui/progress/child_session_report.js";

const STRINGS = {
  childReport: "Report from {agent}",
  childQuestion: "Question from {agent}",
  childSessionOpen: "Open the {agent} task",
};

describe("messageOrigin", () => {
  it.each([
    [{ origin: "wake" }, "wake"],
    [{ origin: 3 }, null],
    [{}, null],
    [null, null],
    [undefined, null],
    ["wake", null],
  ])("reads %j as %j", (metadata, origin) => {
    expect(messageOrigin(metadata)).toBe(origin);
  });
});

describe("childSessionMessage", () => {
  it("reads a report's task, keeping its outcome", () => {
    const task = { threadId: "c1", agentName: "helper", outcome: "failed", body: "broke" };
    expect(childSessionMessage({ origin: "task_output", task })).toEqual({
      origin: "task_output",
      agentName: "helper",
      threadId: "c1",
      body: "broke",
      outcome: "failed",
    });
  });

  it("reads a task with no agent, thread or outcome as empty ones", () => {
    expect(childSessionMessage({ origin: "task_question", task: { body: "which?" } })).toEqual({
      origin: "task_question",
      agentName: "",
      threadId: "",
      body: "which?",
      outcome: null,
    });
  });

  it.each([
    ["a wake", { origin: "wake" }],
    ["no origin", { task: { body: "x" } }],
    ["no task", { origin: "task_output" }],
    ["a task without a body", { origin: "task_output", task: { threadId: "c1" } }],
    ["a body that is not text", { origin: "task_output", task: { body: 7 } }],
    ["no metadata", undefined],
  ])("is null for %s", (_name, metadata) => {
    expect(childSessionMessage(metadata)).toBeNull();
  });
});

describe("renderChildSessionMessage", () => {
  it("draws the body as text, never as markup", () => {
    const card = renderChildSessionMessage(
      {
        origin: "task_output",
        agentName: "helper",
        threadId: "c1",
        body: "<b>x</b>",
        outcome: "ok",
      },
      STRINGS,
    );
    expect(card.querySelector(".child-report-body")?.textContent).toBe("<b>x</b>");
    expect(card.querySelector("b")).toBeNull();
    expect(card.getAttribute("data-outcome")).toBe("ok");
    expect(card.querySelector(".child-report-link")?.getAttribute("data-agent-id")).toBe("helper");
  });

  it("draws no link when the task names no thread, and no outcome when it has none", () => {
    const card = renderChildSessionMessage(
      { origin: "task_question", agentName: "helper", threadId: "", body: "which?", outcome: null },
      STRINGS,
    );
    expect(card.querySelector(".child-report-link")).toBeNull();
    expect(card.hasAttribute("data-outcome")).toBe(false);
    expect(card.querySelector(".child-report-title")?.textContent).toBe("Question from helper");
  });
});
