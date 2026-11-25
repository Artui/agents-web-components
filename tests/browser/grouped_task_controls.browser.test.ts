/**
 * The task controls under the default grouped tool display.
 *
 * A background task's delegating call settles as soon as the task goes to the
 * background, so its group folds to a row that reads done. The controls sit in
 * that folded group, so the group opens itself for a question the user can
 * answer, once per question, and for no other reason.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";
import { taskStep } from "../helpers/task_control_fixture.js";

type Step = Record<string, unknown>;

const QUESTION = taskStep("question", "question");
const BACKGROUNDED = taskStep("question", "backgrounded");

function asking(questionId: string | null, text: string): Step {
  const task = QUESTION["task"] as Record<string, unknown>;
  const { questionId: _dropped, ...rest } = task;
  return {
    ...QUESTION,
    task: questionId === null ? rest : { ...rest, questionId, question: text },
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

interface Drive {
  readonly el: AgUiChat;
  readonly next: (steps: readonly Step[]) => Promise<void>;
}

async function drive(
  first: readonly Step[],
  threadsUrl: string | null = "/agent/threads/",
): Promise<Drive> {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  if (threadsUrl !== null) {
    el.setAttribute("data-threads-url", threadsUrl);
  }
  el.style.width = "400px";
  let more: Step[] = [];
  let wake: () => void = () => {};
  const handle = makeFakeAgent({
    script: async (emit: Emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentStarted("subagent-call-1", "researcher", "call-1");
      for (const step of first) {
        emit.custom("ag_ui.subagent", step);
      }
      emit.toolResult("call-1", "Task task-2 is running in the background.");
      for (;;) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        if (more.length === 0) {
          return;
        }
        for (const step of more) {
          emit.custom("ag_ui.subagent", step);
        }
      }
    },
  });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  void el.sendMessage("go");
  await settle();
  return {
    el,
    next: async (steps) => {
      more = [...steps];
      wake();
      await settle();
    },
  };
}

function root(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function open(el: AgUiChat): string | null {
  return root(el).querySelector(".tool-group")?.getAttribute("data-open") ?? null;
}

function answerVisible(el: AgUiChat): boolean {
  return root(el).querySelector<HTMLElement>(".subagent-answer")?.checkVisibility() ?? false;
}

function fold(el: AgUiChat): void {
  root(el).querySelector<HTMLButtonElement>(".tool-group-head")?.click();
}

describe("task controls under the default grouped display (real browser)", () => {
  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    document.body.replaceChildren();
  });

  it("opens the group for an open question, so Answer, Steer and Cancel are in view", async () => {
    defineChat();
    const { el } = await drive([QUESTION, BACKGROUNDED]);

    expect(open(el)).toBe("true");
    expect(answerVisible(el)).toBe(true);
    expect(root(el).querySelector<HTMLElement>(".subagent-steer")?.checkVisibility()).toBe(true);
    expect(root(el).querySelector<HTMLElement>(".subagent-cancel")?.checkVisibility()).toBe(true);
  });

  it("stays folded where the user folded it, until a new question arrives", async () => {
    defineChat();
    const { el, next } = await drive([QUESTION, BACKGROUNDED]);
    fold(el);
    expect(open(el)).toBe("false");

    await next([BACKGROUNDED, asking("q-1", "Which year?")]);
    expect(open(el)).toBe("false");

    await next([asking("q-2", "And which month?")]);
    expect(open(el)).toBe("true");
    expect(answerVisible(el)).toBe(true);
  });

  it("does not open for a question with no question id", async () => {
    defineChat();
    const { el } = await drive([asking(null, ""), BACKGROUNDED]);

    expect(root(el).querySelector(".subagent[data-awaiting-answer]")).not.toBeNull();
    expect(open(el)).toBe("false");
  });

  it("does not open for a question shown with no live controls", async () => {
    defineChat();
    const { el } = await drive([QUESTION, BACKGROUNDED], null);

    expect(root(el).querySelector(".subagent[data-awaiting-answer]")).not.toBeNull();
    expect(root(el).querySelector<HTMLElement>(".subagent-controls")?.hidden).toBe(true);
    expect(open(el)).toBe("false");
  });
});
