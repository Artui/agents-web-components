import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, SKILLS_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineChat } from "../src/core/define_chat.js";
import type { AgUiSkills } from "../src/skills/ag_ui_skills.js";
import { defineSkills } from "../src/skills/define_skills.js";
import recorded from "./fixtures/skill_editor.json";

const EDITOR = "/a/skills/editor/";
const [PERSONAL, SHARED] = recorded.answers.scopedList.body.skills;
const TEAM = { ...SHARED, id: "3", name: "team-runbook", scope: "team" };

async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 20; j += 1) {
      await Promise.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function badges(el: Element): (string | null)[] {
  return [...(el.shadowRoot as ShadowRoot).querySelectorAll(".skill-row")].map(
    (row) => row.querySelector("[part='skill-scope']")?.textContent ?? null,
  );
}

describe("a host's scope labels reach the skill editor", () => {
  beforeAll(() => {
    defineChat();
    defineSkills();
  });

  beforeEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(url === EDITOR ? { skills: [PERSONAL, SHARED, TEAM] } : []),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("in the chat, through data-strings", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/a/");
    el.setAttribute("data-skill-editor-url", EDITOR);
    el.setAttribute(
      "data-strings",
      JSON.stringify({ "skillScope:shared": "Acme", "skillScope:team": "Team" }),
    );
    document.body.append(el);
    await flush();
    el.openSkillEditor();
    await flush();
    expect(badges(el)).toEqual(["Personal", "Acme", "Team"]);
  });

  it("in <ag-ui-skills>, through strings, and an unlabelled scope draws none", async () => {
    const el = document.createElement(SKILLS_TAG) as AgUiSkills;
    el.setAttribute("data-skill-editor-url", EDITOR);
    el.strings = { "skillScope:personal": "Mine" };
    document.body.append(el);
    await flush();
    expect(badges(el)).toEqual(["Mine", "Company", null]);
  });
});
