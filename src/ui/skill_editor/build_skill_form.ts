import type { EditorSkillDraft } from "../../skills/editor_skill.js";
import type { UiStrings } from "../ui_strings.js";

/** The editor's form, what it holds now, and where a refusal is shown. */
export interface SkillForm {
  readonly form: HTMLFormElement;
  /** The draft the fields hold. */
  read(): EditorSkillDraft;
  /**
   * Show a refusal under the field it names, or above the fields when it
   * names none the form has: the server's words, never rewritten.
   */
  showError(message: string, field: string | null): void;
}

const TEXT_FIELDS = ["name", "description", "body"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

/** Build the editor's fields over `draft`; `onSubmit` runs on Enter in a one-line field. */
export function buildSkillForm(
  draft: EditorSkillDraft,
  strings: UiStrings,
  onSubmit: () => void,
): SkillForm {
  const form = document.createElement("form");
  form.className = "skill-form";
  form.setAttribute("part", "skill-form");
  form.noValidate = true;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit();
  });

  const formError = document.createElement("div");
  formError.className = "skill-form-error";
  formError.setAttribute("role", "alert");
  formError.hidden = true;

  const name = document.createElement("input");
  name.type = "text";
  name.spellcheck = false;
  name.autocomplete = "off";
  name.value = draft.name;
  const description = document.createElement("textarea");
  description.rows = 3;
  description.value = draft.description;
  const body = document.createElement("textarea");
  body.className = "skill-form-body";
  body.spellcheck = false;
  body.value = draft.body;

  const parts = new Map<
    TextField,
    { readonly wrap: HTMLDivElement; readonly error: HTMLDivElement }
  >();
  const field = (
    key: TextField,
    label: string,
    control: HTMLElement,
    hint: string,
  ): HTMLDivElement => {
    const wrap = document.createElement("div");
    wrap.className = "skill-field";
    wrap.dataset["field"] = key;
    const caption = document.createElement("label");
    caption.className = "skill-field-label";
    caption.textContent = label;
    const id = `skill-field-${key}`;
    control.id = id;
    caption.htmlFor = id;
    const error = document.createElement("div");
    error.className = "skill-field-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const note = document.createElement("div");
    note.className = "skill-field-hint";
    note.textContent = hint;
    let input: HTMLElement = control;
    if (key === "name") {
      input = document.createElement("div");
      input.className = "skill-field-slash";
      const slash = document.createElement("span");
      slash.textContent = "/";
      input.append(slash, control);
    }
    wrap.append(caption, input, error, note);
    parts.set(key, { wrap, error });
    return wrap;
  };
  const nameField = field("name", strings.skillName, name, strings.skillNameHint);
  const descriptionField = field(
    "description",
    strings.skillDescription,
    description,
    strings.skillDescriptionHint,
  );

  const reach = document.createElement("fieldset");
  reach.className = "skill-field skill-reach";
  const legend = document.createElement("legend");
  legend.className = "skill-field-label";
  legend.textContent = strings.skillReach;
  const unreachable = document.createElement("div");
  unreachable.className = "skill-notice";
  unreachable.textContent = strings.skillUnreachable;
  const toggle = (label: string, hint: string, checked: boolean): HTMLInputElement => {
    const row = document.createElement("label");
    row.className = "skill-switch";
    const text = document.createElement("span");
    const strong = document.createElement("b");
    strong.textContent = label;
    const small = document.createElement("small");
    small.textContent = hint;
    text.append(strong, small);
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = checked;
    box.addEventListener("change", syncReach);
    row.append(text, box);
    reach.append(row);
    return box;
  };
  reach.append(legend);
  const inMenu = toggle(strings.skillInMenu, strings.skillInMenuHint, draft.userInvocable);
  const mayLoad = toggle(
    strings.skillAgentMayLoad,
    strings.skillAgentMayLoadHint,
    draft.modelInvocable,
  );
  reach.append(unreachable);
  function syncReach(): void {
    unreachable.hidden = inMenu.checked || mayLoad.checked;
  }
  syncReach();

  const bodyField = field("body", strings.skillBody, body, strings.skillBodyHint);
  form.append(formError, nameField, descriptionField, reach, bodyField);
  const controls: Record<TextField, HTMLInputElement | HTMLTextAreaElement> = {
    name,
    description,
    body,
  };

  return {
    form,
    read: () => ({
      name: name.value,
      description: description.value,
      body: body.value,
      userInvocable: inMenu.checked,
      modelInvocable: mayLoad.checked,
    }),
    showError: (message, named) => {
      formError.hidden = true;
      for (const [key, { wrap, error }] of parts) {
        error.hidden = true;
        wrap.classList.remove("skill-field--bad");
        controls[key].removeAttribute("aria-invalid");
      }
      const key = TEXT_FIELDS.find((candidate) => candidate === named);
      if (key === undefined) {
        formError.textContent = message;
        formError.hidden = false;
        return;
      }
      const { wrap, error } = parts.get(key) as { wrap: HTMLDivElement; error: HTMLDivElement };
      error.textContent = message;
      error.hidden = false;
      wrap.classList.add("skill-field--bad");
      controls[key].setAttribute("aria-invalid", "true");
      controls[key].focus();
    },
  };
}
