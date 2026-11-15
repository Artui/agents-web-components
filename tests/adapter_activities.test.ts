/**
 * The activity types pydantic-ai's own AG-UI adapter sends are known to the
 * element out of the box, so `unhandledActivityTypes` keeps meaning "a name
 * nobody here knows". Driven through the fake agent; the same run decoded from
 * the adapter's recorded bytes is in the Chromium project.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineChat();

// Literals rather than the exported constant, so the test pins the wire names
// pydantic-ai sends and not whatever the constant says.
const ENQUEUED = "pydantic_ai_enqueued_messages";
const MCP_APPS = "mcp-apps";
const SILENT = [
  "pydantic_ai_compaction",
  "pydantic_ai_tool_availability_delta",
  "pydantic_ai_model_settings_delta",
  "pydantic_ai_capability_load_delta",
] as const;
const ALL = [ENQUEUED, MCP_APPS, ...SILENT] as const;

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

function mount(
  script: (emit: Emit) => void | Promise<void>,
  strings: AgUiChat["strings"] = {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.strings = strings;
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  document.body.appendChild(el);
  return el;
}

async function send(el: AgUiChat, text: string): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

function tagged(text: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "host-activity";
  node.textContent = text;
  return node;
}

/** What the answer group holds, by class, so an extra node from any type shows. */
function answerClasses(el: AgUiChat): string[] {
  return [...shadow(el).querySelectorAll(".answer > *")].map((node) => node.className);
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("the activity types pydantic-ai's adapter sends", () => {
  it("are none of them unhandled", async () => {
    const el = mount((emit) => {
      emit.activity(ENQUEUED, { messages: [{ role: "user", content: "also this" }] }, "a1");
      emit.activity(MCP_APPS, { resourceUri: "ui://app/view.html" }, "a2");
      for (const [index, type] of SILENT.entries()) {
        emit.activity(type, {}, `s${index}`);
      }
    });

    await send(el, "hi");

    expect(
      el.unhandledActivityTypes.filter((type) => (ALL as readonly string[]).includes(type)),
    ).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("draw the enqueued user text as a user bubble, captioned", async () => {
    const el = mount((emit) => {
      emit.activity(ENQUEUED, { messages: [{ role: "user", content: "also this" }] }, "a1");
    });

    await send(el, "hi");

    const wrapper = shadow(el).querySelector(".answer > .enqueued-messages");
    expect(wrapper?.querySelector(".message.message--user")?.textContent).toBe("also this");
    expect(wrapper?.querySelector(".enqueued-messages-note")?.textContent).toBe(
      "Added during the run",
    );
  });

  it("take their words from the string table", async () => {
    const el = mount(
      (emit) => {
        emit.activity(ENQUEUED, { messages: [{ role: "user", content: "also this" }] }, "a1");
        emit.activity(MCP_APPS, { resourceUri: "ui://app/view.html" }, "a2");
      },
      { enqueuedMessages: "Mid-run", mcpAppUnsupported: "No app view for {uri}" },
    );

    await send(el, "hi");

    expect(shadow(el).querySelector(".enqueued-messages-note")?.textContent).toBe("Mid-run");
    expect(shadow(el).querySelector(".run-notice--mcp-app .run-notice-text")?.textContent).toBe(
      "No app view for ui://app/view.html",
    );
  });

  it("draw nothing, and say nothing, for an enqueued list with no user text", async () => {
    const el = mount((emit) => {
      emit.activity(ENQUEUED, { messages: [{ role: "assistant", content: "x" }] }, "a1");
    });

    await send(el, "hi");

    expect(shadow(el).querySelector(".enqueued-messages")).toBeNull();
    expect(el.unhandledActivityTypes).not.toContain(ENQUEUED);
    expect(warn).not.toHaveBeenCalled();
  });

  it("draw a notice naming the MCP App view that cannot be shown", async () => {
    const el = mount((emit) => {
      emit.activity(MCP_APPS, { resourceUri: "ui://sales/week.html", toolInput: {} }, "a2");
    });

    await send(el, "hi");

    const notice = shadow(el).querySelector(".answer > .run-notice--mcp-app");
    expect(notice?.getAttribute("part")).toBe("run-notice run-notice-mcp-app");
    expect(notice?.querySelector(".run-notice-text")?.textContent).toBe(
      "An app view can't be shown here: ui://sales/week.html",
    );
  });

  it("still draw the notice for an MCP App record with no URI", async () => {
    const el = mount((emit) => {
      emit.activity(MCP_APPS, { toolInput: {} }, "a2");
    });

    await send(el, "hi");

    expect(shadow(el).querySelector(".run-notice--mcp-app .run-notice-text")?.textContent).toBe(
      "An app view can't be shown here: ",
    );
  });

  it("draw nothing for the four records meant for the model", async () => {
    const quiet = mount(() => {});
    await send(quiet, "hi");
    const resting = answerClasses(quiet);

    document.body.innerHTML = "";
    sessionStorage.clear();
    const el = mount((emit) => {
      for (const [index, type] of SILENT.entries()) {
        emit.activity(type, { anything: index }, `s${index}`);
      }
    });
    await send(el, "hi");

    expect(answerClasses(el)).toEqual(resting);
    expect(warn).not.toHaveBeenCalled();
  });

  it("leave django-ag-ui's own compaction notice drawn", async () => {
    const el = mount((emit) => {
      emit.activity("pydantic_ai_compaction", { content: "summary" }, "p1");
      emit.activity("compaction", { removed: 4, before: 6, after: 2 }, "c1");
    });

    await send(el, "hi");

    expect(shadow(el).querySelectorAll(".run-notice--compaction")).toHaveLength(1);
  });

  it("each give way to a host's own registration, made before or after it connects", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit) => {
          for (const [index, type] of ALL.entries()) {
            emit.activity(type, { messages: [{ role: "user", content: "x" }] }, `h${index}`);
          }
        },
      }).agent;
    const [early, late] = [ALL.slice(0, 3), ALL.slice(3)];
    for (const type of early) {
      el.registerActivityRenderer({ type, render: () => tagged(`host ${type}`) });
    }
    document.body.appendChild(el);
    for (const type of late) {
      el.registerActivityRenderer({ type, render: () => tagged(`host ${type}`) });
    }

    await send(el, "hi");

    expect([...shadow(el).querySelectorAll(".host-activity")].map((n) => n.textContent)).toEqual(
      ALL.map((type) => `host ${type}`),
    );
    expect(shadow(el).querySelector(".enqueued-messages")).toBeNull();
    expect(shadow(el).querySelector(".run-notice--mcp-app")).toBeNull();
  });
});
