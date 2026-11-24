import { CUSTOM_AGENT_EVENT, SKILLS_CHANGED_CUSTOM_NAME } from "../constants.js";
import type { CustomAgentDetail } from "../core/events/custom_agent_detail.js";
import { SkillEditor } from "../ui/skill_editor/skill_editor.js";
import { EditorElement } from "../ui/standalone/editor_element.js";
import { SkillEditorClient } from "./skill_editor_client.js";
import { DEFAULT_AG_UI_SKILLS_STRINGS } from "./skills_element_strings.js";
import type { AgUiSkillsStrings, SkillsChat } from "./skills_element_types.js";

/**
 * `<ag-ui-skills>`: the stored-skill editor as an element of its own, for a
 * page that places it away from the chat: the skills the caller may write,
 * an empty state, and the form for one. The same view `<ag-ui-chat>` opens in
 * its panel.
 *
 * Reads `data-skill-editor-url` (django-ag-ui's `SkillEditorView`), its own or
 * the bound chat's; bound as every editor element is (see {@link EditorElement}).
 * Bound to a chat, Draft one with the agent asks that chat, a write refreshes
 * its `/` palette, and a skill a run saved there reloads this list; alone, the
 * draft button is absent.
 */
export class AgUiSkills extends EditorElement<AgUiSkillsStrings> {
  static readonly observedAttributes = ["for", "agents", "data-skill-editor-url"];

  protected readonly urlAttribute = "data-skill-editor-url";
  protected readonly entryKey = "skill_editor_url";
  protected readonly editorName = "skills";
  readonly #editor: SkillEditor;

  constructor() {
    super(DEFAULT_AG_UI_SKILLS_STRINGS);
    const element = this;
    this.#editor = new SkillEditor({
      view: this.view,
      strings: () => this.strings,
      get onDraft(): (() => void) | null {
        const chat = element.chat as SkillsChat | null;
        return chat === null ? null : () => void chat.sendMessage("/create-skill");
      },
      onChanged: () => {
        void (this.chat as SkillsChat | null)?.refreshSkills();
      },
      onClose: () => undefined,
    });
  }

  protected get atRoot(): boolean {
    return this.#editor.atRoot;
  }

  protected back(): void {
    this.#editor.back();
  }

  protected open(url: string): void {
    this.#editor.open(new SkillEditorClient(url, (to, init) => this.request(to, init)));
  }

  protected reset(): void {
    this.#editor.reset();
  }

  protected asked(): void {}

  protected override chatEvents(): readonly (readonly [string, (event: Event) => void])[] {
    return [[CUSTOM_AGENT_EVENT, this.#onCustom]];
  }

  /** A run in the bound chat saved a skill: the list reloads, as the chat's own editor does. */
  readonly #onCustom = (event: Event): void => {
    if ((event as CustomEvent<CustomAgentDetail>).detail.name === SKILLS_CHANGED_CUSTOM_NAME) {
      this.#editor.refresh();
    }
  };
}
