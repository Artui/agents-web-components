import type { Interrupt } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineChat } from "../../src/core/define_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * Who let a call through, as a group shows it: the note inside a lone call's
 * card, and the count on the folded row.
 */

const ROUTINE = { answered_by: "routine:42" };

function mount(
  script: (emit: Emit, params: FakeRunParams) => void,
  attributes: Readonly<Record<string, string>> = {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  el.style.width = "470px";
  el.style.height = "640px";
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

async function send(el: AgUiChat, text: string): Promise<void> {
  void el.sendMessage(text);
  await settle();
}

const height = (node: Element): number => node.getBoundingClientRect().height;

/** Open the group by its row, asserting the row offers it. */
function openRow(el: AgUiChat): void {
  const head = part(el, ".tool-group-head") as HTMLButtonElement;
  expect(head.disabled).toBe(false);
  expect(getComputedStyle(part(el, ".tool-group-chevron")).display).not.toBe("none");
  if (head.getAttribute("aria-expanded") !== "true") {
    head.click();
  }
}

/** One call a routine approved with no one asked. */
function preApproved(args: Record<string, unknown>, result: string): (emit: Emit) => void {
  return (emit) => {
    emit.runStart();
    emit.toolCall("c1", "send_digest", args);
    emit.toolResult("c1", result, ROUTINE);
    emit.runEnd();
  };
}

const SHAPES = [
  ["the minimal group display", { "data-tool-group-display": "minimal" }, { when: "now" }, "ok"],
  ["no arguments and a blank result", {}, {}, ""],
  ["both", { "data-tool-group-display": "minimal" }, {}, ""],
] as const;

beforeAll(() => {
  defineChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("a lone pre-approved call", () => {
  it.each(SHAPES)("can be opened to its note under %s", async (_, attributes, args, result) => {
    const el = mount(preApproved(args, result), attributes);
    await send(el, "go");

    openRow(el);
    const note = part(el, ".tool-call-answered-by");
    expect(height(note)).toBeGreaterThan(0);
    // The rest of the card's head stays out: the row already names the call.
    expect(height(part(el, ".tool-call-name"))).toBe(0);
    expect(height(part(el, ".tool-call-status"))).toBe(0);
  });
});

describe("a lone call a person decided", () => {
  function approval(toolCallId: string): Interrupt {
    return { id: `int-${toolCallId}`, reason: "tool_call", toolCallId, message: "Go?" } as never;
  }

  const DECISIONS = [
    ["approve", "approved by you"],
    ["deny", "declined by you"],
  ] as const;

  for (const [button, words] of DECISIONS) {
    it.each([["the default display", {}, { title: "Sync" }, "ok"], ...SHAPES] as const)(
      `keeps "${words}" under %s`,
      async (_, attributes, args, result) => {
        const el = mount((emit, params) => {
          emit.runStart();
          if (params.resume === undefined) {
            emit.toolCall("e1", "create_event", args);
            emit.interrupt([approval("e1")]);
            return;
          }
          emit.toolResult("e1", result);
          emit.runEnd();
        }, attributes);
        await send(el, "go");
        part(el, `.approval-btn--${button}`).click();
        await settle();

        openRow(el);
        const decision = part(el, ".tool-call-decision");
        expect(decision.textContent).toBe(words);
        expect(height(decision)).toBeGreaterThan(0);
        expect(height(part(el, ".tool-call-name"))).toBe(0);
      },
    );
  }
});

describe("the folded row's pre-approved count", () => {
  function noted(el: AgUiChat): string[] {
    return [...(el.shadowRoot?.querySelectorAll<HTMLElement>(".tool-group-note") ?? [])]
      .filter((note) => getComputedStyle(note).display !== "none")
      .map((note) => note.textContent ?? "");
  }

  it("is drawn while the group is folded and not once it is open", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("c1", "book_room", {});
      emit.toolCall("c2", "send_digest", {});
      emit.toolCall("c3", "read_docs", {});
      emit.toolResult("c1", "ok", { answered_by: "reviewer:openai:gpt-5" });
      emit.toolResult("c2", "ok", ROUTINE);
      emit.toolResult("c3", "ok");
      emit.runEnd();
    });
    await send(el, "go");

    expect(noted(el)).toEqual(["2 pre-approved"]);
    part(el, ".tool-group-head").click();
    expect(noted(el)).toEqual([]);
    expect(getComputedStyle(part(el, ".tool-group-meta")).display).toBe("none");
    part(el, ".tool-group-head").click();
    expect(noted(el)).toEqual(["2 pre-approved"]);
  });

  it("is drawn on a lone call's row too", async () => {
    const el = mount(preApproved({}, "ok"));
    await send(el, "go");

    expect(noted(el)).toEqual(["1 pre-approved"]);
  });
});
