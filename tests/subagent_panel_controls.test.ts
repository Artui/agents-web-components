/**
 * Steer, answer and cancel on the delegation panel.
 *
 * The panel only asks: every state it shows still comes from a step on the
 * stream, so each test checks that an accepted control leaves the stamped
 * attributes as they were until the step arrives. Steps come from the
 * producer's fixture (see `tests/helpers/task_control_fixture.ts`).
 */

import { describe, expect, it, vi } from "vitest";

import type { TaskControlAction, TaskControlResult } from "../src/core/task_controls.js";
import {
  SubAgentPanel,
  type SubAgentUpdate,
  type TaskControlPort,
} from "../src/ui/progress/subagent_panel.js";
import { subAgentUpdate } from "../src/ui/progress/subagent_update.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { taskStep, USER_STEP } from "./helpers/task_control_fixture.js";

function narrowed(value: unknown): SubAgentUpdate {
  const update = subAgentUpdate(value);
  if (update === null) {
    throw new Error("the fixture's own payload did not narrow");
  }
  return update;
}

const BACKGROUNDED = narrowed(taskStep("steered", "backgrounded"));
const QUESTION = narrowed(taskStep("question", "question"));
const ANSWERED = narrowed(taskStep("question", "answered"));
const BY_USER_STEERED = narrowed(USER_STEP.steered);
const BY_USER_CANCEL = narrowed(USER_STEP.cancel_requested);
const FORCED = narrowed(taskStep("cancelled", "cancel_requested"));
const FINISHED: SubAgentUpdate = {
  ...BACKGROUNDED,
  phase: "finished",
  status: "researcher finished",
  task: null,
};

interface Port extends TaskControlPort {
  readonly sent: { taskId: string; action: TaskControlAction }[];
}

function port(
  result: TaskControlResult | Promise<TaskControlResult> = { ok: true },
  available = true,
): Port {
  const sent: { taskId: string; action: TaskControlAction }[] = [];
  return {
    sent,
    available: () => available,
    send: vi.fn(async (taskId: string, action: TaskControlAction) => {
      sent.push({ taskId, action });
      return result;
    }),
  };
}

function q<T extends Element = HTMLElement>(panel: SubAgentPanel, selector: string): T {
  const found = panel.element.querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

const controls = (p: SubAgentPanel) => q<HTMLDivElement>(p, ".subagent-controls");
const steer = (p: SubAgentPanel) => q<HTMLButtonElement>(p, ".subagent-steer");
const answer = (p: SubAgentPanel) => q<HTMLButtonElement>(p, ".subagent-answer");
const cancel = (p: SubAgentPanel) => q<HTMLButtonElement>(p, ".subagent-cancel");
const reply = (p: SubAgentPanel) => q<HTMLFormElement>(p, ".subagent-reply");
const input = (p: SubAgentPanel) => q<HTMLInputElement>(p, ".subagent-reply-input");
const error = (p: SubAgentPanel) => q<HTMLParagraphElement>(p, ".subagent-control-error");
const question = (p: SubAgentPanel) => q<HTMLParagraphElement>(p, ".subagent-question");

/** Every data-* attribute on the panel, to show a control changed none of them. */
function stamped(p: SubAgentPanel): Record<string, string> {
  return Object.fromEntries(
    [...p.element.attributes]
      .filter((attr) => attr.name.startsWith("data-"))
      .map((attr) => [attr.name, attr.value]),
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

function submit(p: SubAgentPanel, text: string): void {
  input(p).value = text;
  reply(p).requestSubmit();
}

describe("the task controls", () => {
  it("are not drawn before a task is named, nor without the routes", () => {
    const bare = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    expect(controls(bare).hidden).toBe(true);

    const unrouted = new SubAgentPanel(DEFAULT_UI_STRINGS, port({ ok: true }, false));
    unrouted.report(BACKGROUNDED);
    expect(controls(unrouted).hidden).toBe(true);

    const portless = new SubAgentPanel();
    portless.report(BACKGROUNDED);
    expect(controls(portless).hidden).toBe(true);
  });

  it("offer steer and cancel on a live task, and answer only while a question is open", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(BACKGROUNDED);

    expect(controls(p).hidden).toBe(false);
    expect(steer(p).hidden).toBe(false);
    expect(cancel(p).hidden).toBe(false);
    expect(answer(p).hidden).toBe(true);
    expect(question(p).hidden).toBe(true);
    expect(steer(p).textContent).toBe(DEFAULT_UI_STRINGS.subAgentSteer);
    expect(cancel(p).textContent).toBe(DEFAULT_UI_STRINGS.subAgentCancelTask);
  });

  it("show the open question as text, never markup", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(
      narrowed({
        ...taskStep("question", "question"),
        task: { taskId: "task-2", questionId: "q-1", question: "<b>Which</b> year?" },
      }),
    );

    expect(answer(p).hidden).toBe(false);
    expect(question(p).hidden).toBe(false);
    expect(question(p).textContent).toBe("<b>Which</b> year?");
    expect(question(p).querySelector("b")).toBeNull();
  });

  it("steer: sends the typed message and changes no state until the step arrives", async () => {
    const ports = port();
    const panel = new SubAgentPanel(DEFAULT_UI_STRINGS, ports);
    panel.report(BACKGROUNDED);
    const before = stamped(panel);

    steer(panel).click();
    expect(reply(panel).hidden).toBe(false);
    expect(reply(panel).getAttribute("data-mode")).toBe("steer");
    expect(input(panel).maxLength).toBe(8000);
    submit(panel, "Only 2024.");
    await settle();

    expect(ports.sent).toEqual([
      { taskId: "task-1", action: { kind: "steer", message: "Only 2024." } },
    ]);
    expect(stamped(panel)).toEqual(before);
    expect(reply(panel).hidden).toBe(true);
    expect(input(panel).value).toBe("");

    panel.report(BY_USER_STEERED);
    expect(panel.element.getAttribute("data-phase")).toBe("steered");
    expect(panel.element.getAttribute("data-source")).toBe("user");
    expect(q(panel, ".subagent-status").textContent).toBe("researcher: steered by you");
  });

  it("refuses blank text in the client, and sends nothing", async () => {
    const ports = port();
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, ports);
    p.report(BACKGROUNDED);
    steer(p).click();
    submit(p, "   ");
    await settle();

    expect(ports.sent).toEqual([]);
    expect(reply(p).hidden).toBe(false);
  });

  it("toggles the reply closed when its own button is pressed again", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(BACKGROUNDED);
    steer(p).click();
    steer(p).click();

    expect(reply(p).hidden).toBe(true);
    expect(steer(p).getAttribute("aria-expanded")).toBe("false");
  });

  it("answer: sends the open question's id, which the step after it does not carry", async () => {
    const ports = port();
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, ports);
    p.report(QUESTION);
    // The backgrounded step that follows a question names no questionId.
    p.report(narrowed(taskStep("question", "backgrounded")));
    answer(p).click();
    expect(reply(p).getAttribute("data-mode")).toBe("answer");
    submit(p, "2024");
    await settle();

    expect(ports.sent).toEqual([
      { taskId: "task-2", action: { kind: "answer", questionId: "q-1", answer: "2024" } },
    ]);
    expect(p.element.hasAttribute("data-awaiting-answer")).toBe(true);

    p.report(ANSWERED);
    expect(p.element.hasAttribute("data-awaiting-answer")).toBe(false);
    expect(answer(p).hidden).toBe(true);
    expect(question(p).hidden).toBe(true);
  });

  it("closes an open answer form once the stream says the question was answered", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(QUESTION);
    answer(p).click();
    p.report(ANSWERED);

    expect(reply(p).hidden).toBe(true);
  });

  it("cancel asks politely first, then offers to stop at once", async () => {
    const ports = port();
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, ports);
    p.report(BACKGROUNDED);
    const before = stamped(p);
    cancel(p).click();
    await settle();

    expect(ports.sent).toEqual([{ taskId: "task-1", action: { kind: "cancel", force: false } }]);
    expect(stamped(p)).toEqual(before);
    expect(cancel(p).textContent).toBe(DEFAULT_UI_STRINGS.subAgentCancelTask);

    p.report(BY_USER_CANCEL);
    expect(p.element.getAttribute("data-cancel")).toBe("requested");
    expect(cancel(p).textContent).toBe(DEFAULT_UI_STRINGS.subAgentForceCancel);
    cancel(p).click();
    await settle();

    expect(ports.sent[1]).toEqual({ taskId: "task-1", action: { kind: "cancel", force: true } });
  });

  it("offers no cancel once a forced cancel was asked for", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(FORCED);

    expect(cancel(p).hidden).toBe(true);
    expect(steer(p).hidden).toBe(false);
  });

  it("disables the control while its request is in flight", async () => {
    let release: (result: TaskControlResult) => void = () => undefined;
    const pending = new Promise<TaskControlResult>((resolve) => {
      release = resolve;
    });
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port(pending));
    p.report(BACKGROUNDED);
    cancel(p).click();
    await settle();

    expect(cancel(p).disabled).toBe(true);
    release({ ok: true });
    await settle();
    expect(cancel(p).disabled).toBe(false);
  });

  it("words a refusal by its reason code, and clears it on the next try", async () => {
    const cases: [TaskControlResult, string][] = [
      [
        { ok: false, status: 409, reason: "not_running" },
        DEFAULT_UI_STRINGS.subAgentControlFinished,
      ],
      [{ ok: false, status: 404, reason: "no_task" }, DEFAULT_UI_STRINGS.subAgentControlFinished],
      [{ ok: false, status: 404, reason: "no_run" }, DEFAULT_UI_STRINGS.subAgentControlFinished],
      [
        { ok: false, status: 409, reason: "not_waiting" },
        DEFAULT_UI_STRINGS.subAgentControlNotWaiting,
      ],
      [
        { ok: false, status: 404, reason: "not_live_here" },
        DEFAULT_UI_STRINGS.subAgentControlUnavailable,
      ],
      [{ ok: false, status: 409, reason: "remote" }, DEFAULT_UI_STRINGS.subAgentControlUnavailable],
      [{ ok: false, status: 404, reason: null }, DEFAULT_UI_STRINGS.subAgentControlUnavailable],
      [{ ok: false, status: 405, reason: null }, DEFAULT_UI_STRINGS.subAgentControlUnavailable],
      [{ ok: false, status: 401, reason: null }, DEFAULT_UI_STRINGS.subAgentControlFailed],
      [{ ok: false, status: 400, reason: "invalid" }, DEFAULT_UI_STRINGS.subAgentControlFailed],
      [{ ok: false, status: 0, reason: null }, DEFAULT_UI_STRINGS.subAgentControlFailed],
    ];
    for (const [result, words] of cases) {
      const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port(result));
      p.report(BACKGROUNDED);
      const before = stamped(p);
      cancel(p).click();
      await settle();

      expect(error(p).hidden).toBe(false);
      expect(error(p).textContent).toBe(words);
      expect(stamped(p)).toEqual(before);
    }

    const ports = port({ ok: false, status: 0, reason: null });
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, ports);
    p.report(BACKGROUNDED);
    cancel(p).click();
    await settle();
    (ports.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });
    cancel(p).click();
    await settle();
    expect(error(p).hidden).toBe(true);
  });

  it("keeps a refused reply open with its text, so it can be sent again", async () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port({ ok: false, status: 0, reason: null }));
    p.report(BACKGROUNDED);
    steer(p).click();
    submit(p, "Only 2024.");
    await settle();

    expect(reply(p).hidden).toBe(false);
    expect(input(p).value).toBe("Only 2024.");
  });

  it("are withdrawn when the task settles", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(QUESTION);
    answer(p).click();
    p.report(FINISHED);

    expect(controls(p).hidden).toBe(true);
    expect(reply(p).hidden).toBe(true);
    expect(question(p).hidden).toBe(true);
  });

  it("send nothing from a control the panel is not showing", async () => {
    const ports = port();
    const bare = new SubAgentPanel(DEFAULT_UI_STRINGS, ports);
    cancel(bare).click();
    answer(bare).click();
    reply(bare).requestSubmit();
    const portless = new SubAgentPanel();
    portless.report(BACKGROUNDED);
    cancel(portless).click();
    await settle();

    expect(ports.sent).toEqual([]);
    expect(reply(bare).hidden).toBe(true);
    expect(error(portless).hidden).toBe(true);
  });

  it("closes an answer form whose question was replaced by another", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(QUESTION);
    answer(p).click();
    p.report(
      narrowed({
        ...taskStep("question", "question"),
        task: { taskId: "task-2", questionId: "q-2", question: "Which month?" },
      }),
    );

    expect(reply(p).hidden).toBe(true);
    expect(question(p).textContent).toBe("Which month?");
  });

  it("keeps a steer form open across a question", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(BACKGROUNDED);
    steer(p).click();
    p.report(QUESTION);

    expect(reply(p).hidden).toBe(false);
    expect(reply(p).getAttribute("data-mode")).toBe("steer");
  });

  it("switches the open form from steer to answer", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(QUESTION);
    steer(p).click();
    answer(p).click();

    expect(reply(p).getAttribute("data-mode")).toBe("answer");
    expect(steer(p).getAttribute("aria-expanded")).toBe("false");
    expect(answer(p).getAttribute("aria-expanded")).toBe("true");
    expect(input(p).placeholder).toBe(DEFAULT_UI_STRINGS.subAgentAnswerPlaceholder);
  });

  it("offers no answer to a question that names no question id", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(
      narrowed({ ...taskStep("question", "question"), task: { taskId: "t", question: "Why?" } }),
    );

    expect(p.element.hasAttribute("data-awaiting-answer")).toBe(true);
    expect(answer(p).hidden).toBe(true);
  });

  it("shows no question line for a question the server sent no text for", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(
      narrowed({ ...taskStep("question", "question"), task: { taskId: "t", questionId: "q" } }),
    );

    expect(answer(p).hidden).toBe(false);
    expect(question(p).hidden).toBe(true);
  });

  it("sit beside the row, never inside the row's button", () => {
    const p = new SubAgentPanel(DEFAULT_UI_STRINGS, port());
    p.report(BACKGROUNDED);

    expect(controls(p).closest("button")).toBeNull();
    expect(controls(p).parentElement).toBe(p.element);
  });
});
