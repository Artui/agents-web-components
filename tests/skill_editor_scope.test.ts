import { describe, expect, it, vi } from "vitest";
import type { EditorSkill } from "../src/skills/editor_skill.js";
import type { SkillEditorClient, SkillEditorResult } from "../src/skills/skill_editor_client.js";
import { PanelView } from "../src/ui/shell/panel_view.js";
import { SkillEditor } from "../src/ui/skill_editor/skill_editor.js";
import type { SkillEditorStrings } from "../src/ui/skill_editor/skill_editor_strings.js";
import { DEFAULT_SKILL_EDITOR_STRINGS } from "../src/ui/skill_editor/skill_editor_strings.js";
import recorded from "./fixtures/skill_editor.json";

const [PERSONAL, SHARED] = recorded.answers.scopedList.body.skills as EditorSkill[];
const UNSCOPED = recorded.answers.created.body as EditorSkill;

function ok<T>(value: T): SkillEditorResult<T> {
  return { ok: true, value };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

async function open(
  skills: readonly EditorSkill[],
  strings: SkillEditorStrings = DEFAULT_SKILL_EDITOR_STRINGS,
) {
  const view = new PanelView(
    () => "Back",
    () => editor.back(),
  );
  document.body.replaceChildren(view.element);
  const editor = new SkillEditor({
    view,
    strings: () => strings,
    onDraft: null,
    onChanged: vi.fn(),
    onClose: vi.fn(),
  });
  const stub = {
    list: vi.fn(async () => ok(skills)),
    create: vi.fn(async () => ok(SHARED as EditorSkill)),
    update: vi.fn(async () => ok(PERSONAL as EditorSkill)),
    setEnabled: vi.fn(async () => ok(PERSONAL as EditorSkill)),
  };
  editor.open(stub as unknown as SkillEditorClient);
  await flush();
  const badges = () =>
    [...view.element.querySelectorAll(".skill-row")].map((row) => {
      const badge = row.querySelector<HTMLElement>("[part='skill-scope']");
      return badge === null ? null : [badge.dataset["scope"], badge.textContent];
    });
  return { view, stub, badges };
}

describe("the skill editor's scope badge", () => {
  it("says Personal for a personal skill and Company for a shared one", async () => {
    const { badges } = await open([PERSONAL as EditorSkill, SHARED as EditorSkill]);
    expect(badges()).toEqual([
      ["personal", "Personal"],
      ["shared", "Company"],
    ]);
  });

  it("sits after the name, which keeps its own text", async () => {
    const { view } = await open([PERSONAL as EditorSkill]);
    const name = view.element.querySelector(".skill-row-name") as HTMLElement;
    expect(name.textContent).toBe("/weekly-report");
    expect(name.nextElementSibling?.getAttribute("part")).toBe("skill-scope");
  });

  it("draws nothing for a skill the server gave no scope", async () => {
    const { badges } = await open([UNSCOPED]);
    expect(badges()).toEqual([null]);
  });

  it("takes the host's words for the two scopes it knows", async () => {
    const { badges } = await open([PERSONAL as EditorSkill, SHARED as EditorSkill], {
      ...DEFAULT_SKILL_EDITOR_STRINGS,
      "skillScope:personal": "Mine",
      "skillScope:shared": "Org",
    });
    expect(badges()).toEqual([
      ["personal", "Mine"],
      ["shared", "Org"],
    ]);
  });

  it("labels a scope it does not know when the host names one", async () => {
    const team = { ...(PERSONAL as EditorSkill), scope: "team" };
    const { badges } = await open([team], {
      ...DEFAULT_SKILL_EDITOR_STRINGS,
      "skillScope:team": "Team",
    });
    expect(badges()).toEqual([["team", "Team"]]);
  });

  it.each(["team", "constructor", "toString"])(
    "draws nothing for an unknown scope %s the host has not labelled",
    async (scope) => {
      const { badges } = await open([{ ...(PERSONAL as EditorSkill), scope }]);
      expect(badges()).toEqual([null]);
    },
  );

  it("draws nothing for a host label that is not a string", async () => {
    const strings = { ...DEFAULT_SKILL_EDITOR_STRINGS, "skillScope:shared": 7 };
    const { badges } = await open(
      [SHARED as EditorSkill],
      strings as unknown as SkillEditorStrings,
    );
    expect(badges()).toEqual([null]);
  });

  it("keeps the badge on the server's answer after a save, and never sends a scope", async () => {
    const { view, stub, badges } = await open([PERSONAL as EditorSkill]);
    (view.element.querySelector(".skill-row-open") as HTMLButtonElement).click();
    const save = [...view.element.querySelectorAll("button")].find(
      (button) => button.textContent === "Save",
    ) as HTMLButtonElement;
    save.click();
    await flush();
    expect((stub.update.mock.calls[0] as unknown[])[1]).not.toHaveProperty("scope");
    expect(badges()).toEqual([["personal", "Personal"]]);
  });
});
