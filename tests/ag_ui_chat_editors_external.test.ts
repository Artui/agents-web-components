import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, OPEN_EDITOR_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import type { OpenEditorDetail } from "../src/core/events/open_editor_detail.js";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function q<T extends Element = HTMLElement>(el: AgUiChat, selector: string): T {
  const found = (el.shadowRoot as ShadowRoot).querySelector<T>(selector);
  if (found === null) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-skills-url", "/agent/skills/");
  el.setAttribute("data-skill-editor-url", "/agent/skills/editor/");
  el.setAttribute("data-routines-url", "/agent/routines/");
  el.setAttribute("data-slash-commands", "true");
  el.setAttribute("data-editors", "external");
  document.body.append(el);
  return el;
}

describe('<ag-ui-chat data-editors="external">', () => {
  let heard: OpenEditorDetail[];
  const listen = (event: Event) => heard.push((event as CustomEvent<OpenEditorDetail>).detail);

  beforeAll(() => {
    defineChat();
  });

  beforeEach(() => {
    document.body.replaceChildren();
    heard = [];
    document.addEventListener(OPEN_EDITOR_EVENT, listen);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.endsWith("/editor/")
          ? json({ skills: [] })
          : url.endsWith("/routines/")
            ? json({ routines: [], grantable: [] })
            : json([]),
      ),
    );
  });

  afterEach(() => {
    document.removeEventListener(OPEN_EDITOR_EVENT, listen);
    vi.unstubAllGlobals();
  });

  it("hands the palette's Manage skills to the page, closing the palette and opening nothing", async () => {
    const el = mount();
    await flush();
    const input = q<HTMLTextAreaElement>(el, ".input");
    input.value = "/";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(q(el, ".skill-palette").hidden).toBe(false);
    q<HTMLButtonElement>(el, ".skill-item--manage").click();
    await flush();
    expect(heard).toEqual([{ editor: "skills", fromConversation: false }]);
    expect(q(el, ".skill-palette").hidden).toBe(true);
    expect(q(el, ".panel-view").hidden).toBe(true);
  });

  it("hands the Routines button to the page, and still opens the panel from the methods", async () => {
    const el = mount();
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--routines").click();
    await flush();
    expect(heard).toEqual([{ editor: "routines", fromConversation: false }]);
    expect(q(el, ".panel-view").hidden).toBe(true);

    el.openRoutines();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
    el.closeRoutines();
    el.openSkillEditor();
    await flush();
    expect(q(el, ".panel-view-title").textContent).toBe("Skills");
    expect(heard).toHaveLength(1);
  });

  it("reads the attribute at each click, so removing it opens the panel again", async () => {
    const el = mount();
    await flush();
    el.removeAttribute("data-editors");
    q<HTMLButtonElement>(el, ".header-btn--routines").click();
    await flush();
    expect(heard).toEqual([]);
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
  });

  it("hands over only for the value external: any other value opens the panel", async () => {
    const el = mount();
    el.setAttribute("data-editors", "inline");
    await flush();
    q<HTMLButtonElement>(el, ".header-btn--routines").click();
    await flush();
    expect(heard).toEqual([]);
    expect(q(el, ".panel-view-title").textContent).toBe("Routines");
  });

  it("refetches the palette's catalog on refreshSkills", async () => {
    const el = mount();
    await flush();
    const before = vi.mocked(fetch).mock.calls.filter(([url]) => url === "/agent/skills/").length;
    await el.refreshSkills();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/agent/skills/").length).toBe(
      before + 1,
    );
  });
});
