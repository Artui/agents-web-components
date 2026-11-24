import { ICON_PLUS } from "../../constants.js";
import type { EditorSkill, EditorSkillDraft } from "../../skills/editor_skill.js";
import type { SkillEditorClient, SkillEditorRefusal } from "../../skills/skill_editor_client.js";
import { fillUiString } from "../fill_ui_string.js";
import { headerButton } from "../shell/header_button.js";
import type { PanelView } from "../shell/panel_view.js";
import { buildSkillForm } from "./build_skill_form.js";
import type { SkillEditorStrings } from "./skill_editor_strings.js";

/** What the skill editor needs from the element that owns it. */
export interface SkillEditorHost {
  /** The full-panel view the editor draws into. */
  readonly view: PanelView;
  readonly strings: () => SkillEditorStrings;
  /** Leave the editor and ask the agent to draft a skill; `null` when no chat is there to ask. */
  readonly onDraft: (() => void) | null;
  /** A write landed: the palette's catalog is stale. */
  readonly onChanged: () => void;
  /** Leave the editor for the conversation. */
  readonly onClose: () => void;
}

const BLANK: EditorSkillDraft = {
  name: "",
  description: "",
  body: "",
  userInvocable: true,
  modelInvocable: true,
};

/**
 * The stored-skill editor: a list of the skills the caller may write, an
 * empty state, and a form for one skill, drawn into a {@link PanelView}.
 *
 * Every write goes to the server, which owns every rule (name, size, count,
 * reserved names, who may write); a refusal is shown as the server worded it.
 * A generation number drops any answer that lands after the editor was reset
 * or reopened, so a slow list for one principal never paints for the next.
 */
export class SkillEditor {
  readonly #host: SkillEditorHost;
  #skills: readonly EditorSkill[] = [];
  #screen: "closed" | "list" | "edit" = "closed";
  #generation = 0;
  #client: SkillEditorClient | null = null;

  constructor(host: SkillEditorHost) {
    this.#host = host;
  }

  /** Whether the editor is showing. */
  get isOpen(): boolean {
    return this.#screen !== "closed";
  }

  /** Whether the editor shows its first screen (the list), with nothing to step back to inside it. */
  get atRoot(): boolean {
    return this.#screen !== "edit";
  }

  /** Open on the list, loaded fresh through `client`. */
  open(client: SkillEditorClient): void {
    this.#client = client;
    this.#generation += 1;
    this.#screen = "list";
    void this.#loadList();
  }

  /** Step back: from a skill to the list, from the list to the conversation. */
  back(): void {
    if (this.#screen === "edit") {
      this.#screen = "list";
      this.#drawList();
      return;
    }
    this.#host.onClose();
  }

  /** The catalog changed elsewhere (a run saved a skill): reload the list if it shows. */
  refresh(): void {
    if (this.#screen === "list") {
      this.#generation += 1;
      void this.#loadList();
    }
  }

  /** Forget everything the editor held (bodies included) and stop any answer in flight. */
  reset(): void {
    this.#generation += 1;
    this.#skills = [];
    this.#client = null;
    this.#screen = "closed";
  }

  async #loadList(): Promise<void> {
    const generation = this.#generation;
    const result = await (this.#client as SkillEditorClient).list();
    if (generation !== this.#generation) {
      return;
    }
    if (!result.ok) {
      this.#drawUnavailable();
      return;
    }
    this.#skills = result.value;
    this.#drawList();
  }

  #drawUnavailable(): void {
    const strings = this.#host.strings();
    const line = document.createElement("p");
    line.className = "skill-editor-unavailable";
    line.setAttribute("role", "alert");
    line.textContent = strings.skillsUnavailable;
    this.#host.view.show({ title: strings.skills, body: [line] });
  }

  #drawList(): void {
    const strings = this.#host.strings();
    const add = headerButton("new-skill", strings.newSkill, ICON_PLUS);
    add.addEventListener("click", () => this.#edit(null));
    if (this.#skills.length === 0) {
      this.#host.view.show({ title: strings.skills, actions: [add], body: [this.#empty()] });
      return;
    }
    const rows = document.createElement("div");
    rows.className = "skill-rows";
    rows.setAttribute("part", "skill-rows");
    for (const skill of this.#skills) {
      rows.append(this.#row(skill));
    }
    this.#host.view.show({
      title: strings.skills,
      sub: String(this.#skills.length),
      actions: [add],
      body: [rows],
      footer: this.#draftButtons("skill-editor-btn skill-editor-btn--block"),
    });
  }

  #row(skill: EditorSkill): HTMLElement {
    const strings = this.#host.strings();
    const row = document.createElement("div");
    row.className = skill.enabled ? "skill-row" : "skill-row skill-row--off";
    row.setAttribute("part", "skill-row");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "skill-row-open";
    const name = document.createElement("span");
    name.className = "skill-row-name";
    name.textContent = `/${skill.name}`;
    const description = document.createElement("span");
    description.className = "skill-row-desc";
    description.textContent = skill.description;
    const meta = document.createElement("span");
    meta.className = "skill-row-meta";
    const reach = [
      skill.enabled ? null : strings.skillOff,
      skill.userInvocable ? strings.skillInMenu : null,
      skill.modelInvocable ? strings.skillAgentMayLoad : null,
    ];
    for (const text of reach) {
      if (text !== null) {
        const tag = document.createElement("span");
        tag.textContent = text;
        meta.append(tag);
      }
    }
    open.append(name, description, meta);
    open.addEventListener("click", () => this.#edit(skill));
    row.append(open);
    if (!skill.enabled) {
      const turnOn = document.createElement("button");
      turnOn.type = "button";
      turnOn.className = "skill-editor-btn skill-editor-btn--ghost";
      turnOn.textContent = strings.turnOn;
      turnOn.addEventListener("click", () => {
        void this.#setEnabled(skill, true);
      });
      row.append(turnOn);
    }
    return row;
  }

  #empty(): HTMLElement {
    const strings = this.#host.strings();
    const wrap = document.createElement("div");
    wrap.className = "skill-empty";
    wrap.setAttribute("part", "skill-empty");
    const heading = document.createElement("h3");
    heading.textContent = strings.noSkills;
    const text = document.createElement("p");
    const words = strings.noSkillsBody;
    const at = words.indexOf("{example}");
    if (at < 0) {
      text.textContent = words;
    } else {
      const chip = document.createElement("code");
      chip.textContent = "/weekly-report";
      text.append(words.slice(0, at), chip, words.slice(at + "{example}".length));
    }
    const write = document.createElement("button");
    write.type = "button";
    write.className = "skill-editor-btn skill-editor-btn--ghost";
    write.textContent = strings.writeSkill;
    write.addEventListener("click", () => this.#edit(null));
    wrap.append(
      heading,
      text,
      ...this.#draftButtons("skill-editor-btn skill-editor-btn--primary"),
      write,
    );
    return wrap;
  }

  /** The draft-with-the-agent button, or none when the host has no chat to ask. */
  #draftButtons(className: string): HTMLButtonElement[] {
    const onDraft = this.#host.onDraft;
    if (onDraft === null) {
      return [];
    }
    const draft = document.createElement("button");
    draft.type = "button";
    draft.className = className;
    draft.textContent = this.#host.strings().draftSkill;
    draft.addEventListener("click", () => onDraft());
    return [draft];
  }

  #edit(skill: EditorSkill | null): void {
    const strings = this.#host.strings();
    this.#screen = "edit";
    const save = document.createElement("button");
    const form = buildSkillForm(skill ?? BLANK, strings, () => save.click());
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "skill-editor-btn skill-editor-btn--ghost";
    cancel.textContent = strings.cancel;
    cancel.addEventListener("click", () => this.back());
    save.type = "button";
    save.className = "skill-editor-btn skill-editor-btn--primary";
    save.textContent = skill === null ? strings.create : strings.save;
    save.addEventListener("click", () => {
      void this.#save(skill, form.read(), (refusal) => {
        form.showError(refusal.message ?? strings.skillSaveFailed, refusal.field);
      });
    });
    const grow = document.createElement("span");
    grow.className = "skill-editor-grow";
    const footer: HTMLElement[] = [];
    if (skill?.enabled === true) {
      const turnOff = document.createElement("button");
      turnOff.type = "button";
      turnOff.className = "skill-editor-btn skill-editor-btn--danger";
      turnOff.textContent = strings.turnOff;
      turnOff.addEventListener("click", () => {
        void this.#setEnabled(skill, false);
      });
      footer.push(turnOff);
    }
    footer.push(grow, cancel, save);
    this.#host.view.show({
      title: skill === null ? strings.newSkillTitle : strings.editSkillTitle,
      ...(skill === null ? {} : { sub: `/${skill.name}` }),
      body: [form.form],
      footer,
    });
  }

  async #save(
    skill: EditorSkill | null,
    draft: EditorSkillDraft,
    refused: (refusal: SkillEditorRefusal) => void,
  ): Promise<void> {
    const client = this.#client as SkillEditorClient;
    const generation = this.#generation;
    const result =
      skill === null ? await client.create(draft) : await client.update(skill.id, draft);
    if (generation !== this.#generation) {
      return;
    }
    if (!result.ok) {
      refused(result);
      return;
    }
    this.#landed(result.value, this.#host.strings().skillSaved);
  }

  async #setEnabled(skill: EditorSkill, enabled: boolean): Promise<void> {
    const client = this.#client as SkillEditorClient;
    const generation = this.#generation;
    const result = await client.setEnabled(skill.id, enabled);
    if (generation !== this.#generation) {
      return;
    }
    const strings = this.#host.strings();
    if (!result.ok) {
      this.#screen = "list";
      this.#drawList();
      this.#host.view.announce(result.message ?? strings.skillSaveFailed);
      return;
    }
    this.#landed(result.value, enabled ? strings.skillTurnedOn : strings.skillTurnedOff);
  }

  /** A write the server accepted: the list takes its answer, and the palette refetches. */
  #landed(saved: EditorSkill, template: string): void {
    const known = this.#skills.some((skill) => skill.id === saved.id);
    this.#skills = known
      ? this.#skills.map((skill) => (skill.id === saved.id ? saved : skill))
      : [saved, ...this.#skills];
    this.#screen = "list";
    this.#drawList();
    this.#host.view.announce(fillUiString(template, { name: saved.name }));
    this.#host.onChanged();
  }
}
