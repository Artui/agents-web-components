import { describe, expect, it, vi } from "vitest";
import type { EditorSkill } from "../src/skills/editor_skill.js";
import type { SkillEditorClient, SkillEditorResult } from "../src/skills/skill_editor_client.js";
import { PanelView } from "../src/ui/shell/panel_view.js";
import { SkillEditor } from "../src/ui/skill_editor/skill_editor.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "../src/ui/ui_strings.js";
import recorded from "./fixtures/skill_editor.json";

const WEEKLY = recorded.answers.created.body as EditorSkill;
const DAILY: EditorSkill = {
  ...WEEKLY,
  id: "2",
  name: "daily-digest",
  userInvocable: false,
  modelInvocable: true,
};

type Pending<T> = { promise: Promise<T>; resolve: (value: T) => void };

function pending<T>(): Pending<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function ok<T>(value: T): SkillEditorResult<T> {
  return { ok: true, value };
}

const REFUSED = { ok: false, status: 502, message: null, field: null } as const;

function setup(strings: UiStrings = DEFAULT_UI_STRINGS) {
  const view = new PanelView(
    () => "Back",
    () => editor.back(),
  );
  document.body.replaceChildren(view.element);
  const host = {
    view,
    strings: () => strings,
    onDraft: vi.fn(),
    onChanged: vi.fn(),
    onClose: vi.fn(),
  };
  const editor = new SkillEditor(host);
  const client = {
    list: vi.fn(async () => ok([WEEKLY, DAILY])),
    create: vi.fn(async () => ok(WEEKLY)),
    update: vi.fn(async () => ok(WEEKLY)),
    setEnabled: vi.fn(async () => ok(WEEKLY)),
  };
  const $ = <T extends Element>(s: string) => view.element.querySelector<T>(s) as T;
  const button = (text: string) =>
    [...view.element.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    ) as HTMLButtonElement;
  return {
    view,
    host,
    editor,
    client: client as unknown as SkillEditorClient,
    stub: client,
    $,
    button,
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

describe("SkillEditor", () => {
  it("tags each row with where it reaches, and opens a new skill from the bar", async () => {
    const { editor, client, $, view } = setup();
    editor.open(client);
    await flush();

    const metas = [...view.element.querySelectorAll(".skill-row-meta")].map((m) => m.textContent);
    expect(metas).toEqual(["In the / menu", "Agent may load it on its own"]);
    $<HTMLButtonElement>(".header-btn--new-skill").click();
    expect($(".panel-view-title").textContent).toBe("New skill");
  });

  it("leaves the list alone on refresh when it is not showing", async () => {
    const { editor, client, stub } = setup();
    editor.refresh();
    editor.open(client);
    await flush();
    stub.list.mockClear();
    editor.reset();
    editor.refresh();
    expect(stub.list).not.toHaveBeenCalled();
  });

  it("drops a list that lands after a reset", async () => {
    const { editor, client, stub, view } = setup();
    const slow = pending<SkillEditorResult<EditorSkill[]>>();
    stub.list.mockReturnValueOnce(slow.promise);
    editor.open(client);
    editor.reset();
    slow.resolve(ok([WEEKLY]));
    await flush();
    expect(view.element.querySelector(".skill-row")).toBeNull();
  });

  it("drops a save and a toggle that land after a reset", async () => {
    const { editor, client, stub, button, host } = setup();
    editor.open(client);
    await flush();
    const save = pending<SkillEditorResult<EditorSkill>>();
    const toggle = pending<SkillEditorResult<EditorSkill>>();
    stub.update.mockReturnValueOnce(save.promise);
    stub.setEnabled.mockReturnValueOnce(toggle.promise);
    (document.querySelector(".skill-row-open") as HTMLButtonElement).click();
    button("Save").click();
    button("Turn off").click();
    editor.reset();
    save.resolve(ok(WEEKLY));
    toggle.resolve(ok(WEEKLY));
    await flush();
    expect(host.onChanged).not.toHaveBeenCalled();
  });

  it("saves on the form's own submit, and cancels back to the list", async () => {
    const { editor, client, stub, button, $ } = setup();
    editor.open(client);
    await flush();
    button("Write it yourself")?.click();
    (document.querySelector(".skill-row-open") as HTMLButtonElement).click();
    $<HTMLFormElement>(".skill-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(stub.update).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ name: "weekly-report" }),
    );

    (document.querySelector(".skill-row-open") as HTMLButtonElement).click();
    button("Cancel").click();
    expect($(".panel-view-title").textContent).toBe("Skills");
  });

  it("keeps the other rows as they were when one is saved", async () => {
    const { editor, client, stub, view } = setup();
    editor.open(client);
    await flush();
    stub.update.mockResolvedValueOnce(ok({ ...WEEKLY, description: "Per team." }));
    (view.element.querySelector(".skill-row-open") as HTMLButtonElement).click();
    view.element.querySelector<HTMLFormElement>(".skill-form")?.dispatchEvent(new Event("submit"));
    await flush();
    expect([...view.element.querySelectorAll(".skill-row-desc")].map((d) => d.textContent)).toEqual(
      ["Per team.", DAILY.description],
    );
  });

  it("words a refusal without a message with the generic failure", async () => {
    const { editor, client, stub, button, $ } = setup();
    stub.list.mockResolvedValueOnce(ok([]));
    stub.create.mockResolvedValueOnce(REFUSED);
    editor.open(client);
    await flush();
    button("Write it yourself").click();
    button("Create").click();
    await flush();
    expect($(".skill-form-error").textContent).toBe(DEFAULT_UI_STRINGS.skillSaveFailed);
  });

  it("shows the empty state's words whole when a translation drops the example", async () => {
    const strings = { ...DEFAULT_UI_STRINGS, noSkillsBody: "Nothing here." };
    const { editor, client, stub, $ } = setup(strings);
    stub.list.mockResolvedValueOnce(ok([]));
    editor.open(client);
    await flush();
    expect($(".skill-empty p").innerHTML).toBe("Nothing here.");
  });
});
