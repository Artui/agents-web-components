import { fillUiString } from "../fill_ui_string.js";
import type { UiStrings } from "../ui_strings.js";
import type { GrantableTool, RoutineDraft } from "./routines_client.js";
import { weekdayName } from "./utils.js";

/** The routine form, what it holds now, and where a refusal is shown. */
export interface RoutineForm {
  readonly form: HTMLFormElement;
  /** The draft the fields hold, every granted destructive tool named as confirmed. */
  read(): RoutineDraft;
  /** Show a refusal above the fields, in the server's words. */
  showError(message: string): void;
}

/**
 * Build the routine form over `draft`, offering `tools` to pre-approve.
 *
 * A destructive tool is granted only through an inline confirmation naming it
 * destructive; one already in `draft.confirmDestructive` (held by the routine)
 * starts granted. `onSubmit` runs on Enter in a one-line field.
 */
export function buildRoutineForm(
  draft: RoutineDraft,
  tools: readonly GrantableTool[],
  strings: UiStrings,
  onSubmit: () => void,
): RoutineForm {
  const form = document.createElement("form");
  form.className = "skill-form routine-form";
  form.setAttribute("part", "routine-form");
  form.noValidate = true;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit();
  });

  const formError = document.createElement("div");
  formError.className = "skill-form-error";
  formError.setAttribute("role", "alert");
  formError.hidden = true;

  const field = (key: string, label: string, control: HTMLElement, hint?: string) => {
    const wrap = document.createElement("div");
    wrap.className = "skill-field";
    wrap.dataset["field"] = key;
    const caption = document.createElement("label");
    caption.className = "skill-field-label";
    caption.textContent = label;
    control.id = `routine-field-${key}`;
    caption.htmlFor = control.id;
    wrap.append(caption, control);
    if (hint !== undefined) {
      const note = document.createElement("div");
      note.className = "skill-field-hint";
      note.textContent = hint;
      wrap.append(note);
    }
    return wrap;
  };
  const input = (type: string, value: string): HTMLInputElement => {
    const control = document.createElement("input");
    control.type = type;
    control.autocomplete = "off";
    control.value = value;
    return control;
  };

  const name = input("text", draft.name);
  const prompt = document.createElement("textarea");
  prompt.rows = 4;
  prompt.value = draft.prompt;

  const when = document.createElement("fieldset");
  when.className = "skill-field routine-when";
  const legend = document.createElement("legend");
  legend.className = "skill-field-label";
  legend.textContent = strings.routineSchedule;
  const kinds = document.createElement("div");
  kinds.className = "routine-kinds";
  const kind = (value: "weekly" | "interval", label: string): HTMLInputElement => {
    const row = document.createElement("label");
    const radio = input("radio", value);
    radio.name = "routine-kind";
    radio.checked = draft.schedule.kind === value;
    radio.addEventListener("change", syncKind);
    row.append(radio, label);
    kinds.append(row);
    return radio;
  };
  const weekly = kind("weekly", strings.routineWeekly);
  kind("interval", strings.routineInterval);

  const weeklyPart = document.createElement("div");
  weeklyPart.className = "routine-weekly";
  const days = document.createElement("div");
  days.className = "routine-days";
  const held = draft.schedule.kind === "weekly" ? draft.schedule.weekdays : [0, 1, 2, 3, 4];
  const dayBoxes = [0, 1, 2, 3, 4, 5, 6].map((day) => {
    const chip = document.createElement("label");
    chip.className = "routine-day";
    const box = input("checkbox", String(day));
    box.checked = held.includes(day);
    chip.append(box, weekdayName(day));
    days.append(chip);
    return box;
  });
  const at = input("time", draft.schedule.kind === "weekly" ? draft.schedule.at : "09:00");
  weeklyPart.append(days, field("at", strings.routineAt, at));

  const every = input(
    "number",
    String(draft.schedule.kind === "interval" ? draft.schedule.every_hours : 24),
  );
  every.min = "1";
  every.max = "8784";
  const intervalPart = field("every", strings.routineEvery, every);
  intervalPart.classList.add("routine-interval");
  const timezone = input("text", draft.timezone);
  timezone.spellcheck = false;
  when.append(
    legend,
    kinds,
    weeklyPart,
    intervalPart,
    field("timezone", strings.routineTimezone, timezone),
  );
  function syncKind(): void {
    weeklyPart.hidden = !weekly.checked;
    intervalPart.hidden = weekly.checked;
  }
  syncKind();

  const grant = document.createElement("fieldset");
  grant.className = "skill-field routine-tools";
  grant.setAttribute("part", "routine-tools");
  const grantLegend = document.createElement("legend");
  grantLegend.className = "skill-field-label";
  grantLegend.textContent = strings.routineTools;
  const grantHint = document.createElement("div");
  grantHint.className = "skill-field-hint";
  grantHint.textContent = tools.length === 0 ? strings.routineNoTools : strings.routineToolsHint;
  grant.append(grantLegend, grantHint);
  const granted = new Set(draft.preapprovedTools);
  const confirmed = new Set(draft.confirmDestructive);
  for (const tool of tools) {
    grant.append(toolRow(tool, granted, confirmed, strings));
  }

  form.append(
    formError,
    field("name", strings.routineName, name),
    field("prompt", strings.routinePrompt, prompt, strings.routinePromptHint),
    when,
    grant,
  );

  return {
    form,
    read: () => {
      const preapproved = tools.map((tool) => tool.name).filter((tool) => granted.has(tool));
      return {
        name: name.value,
        prompt: prompt.value,
        schedule: weekly.checked
          ? {
              kind: "weekly",
              weekdays: dayBoxes.flatMap((box, day) => (box.checked ? [day] : [])),
              at: at.value,
            }
          : { kind: "interval", every_hours: Number(every.value) },
        timezone: timezone.value,
        enabled: draft.enabled,
        preapprovedTools: preapproved,
        confirmDestructive: tools
          .filter((tool) => tool.destructive && granted.has(tool.name))
          .map((tool) => tool.name),
      };
    },
    showError: (message) => {
      formError.textContent = message;
      formError.hidden = false;
      formError.scrollIntoView({ block: "nearest" });
    },
  };
}

/** One tool's switch; a destructive one asks, naming it destructive, before it is granted. */
function toolRow(
  tool: GrantableTool,
  granted: Set<string>,
  confirmed: Set<string>,
  strings: UiStrings,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "routine-tool";
  wrap.setAttribute("part", "routine-tool");
  const row = document.createElement("label");
  row.className = "skill-switch";
  const text = document.createElement("span");
  const name = document.createElement("code");
  name.textContent = tool.name;
  text.append(name);
  if (tool.destructive) {
    const tag = document.createElement("span");
    tag.className = "routine-destructive";
    tag.setAttribute("part", "routine-destructive");
    tag.textContent = strings.routineDestructive;
    text.append(tag);
  }
  const box = document.createElement("input");
  box.type = "checkbox";
  box.name = tool.name;
  box.checked = granted.has(tool.name);
  row.append(text, box);
  wrap.append(row);

  const confirm = document.createElement("div");
  confirm.className = "routine-confirm";
  confirm.setAttribute("role", "alertdialog");
  confirm.hidden = true;
  const question = document.createElement("p");
  const asked = fillUiString(strings.routineGrantDestructive, { name: tool.name });
  question.textContent = asked;
  const yes = document.createElement("button");
  yes.type = "button";
  yes.className = "skill-editor-btn skill-editor-btn--danger";
  yes.textContent = strings.routineGrant;
  const no = document.createElement("button");
  no.type = "button";
  no.className = "skill-editor-btn skill-editor-btn--ghost";
  no.textContent = strings.cancel;
  confirm.append(question, yes, no);
  confirm.setAttribute("aria-label", asked);
  wrap.append(confirm);

  box.addEventListener("change", () => {
    if (!box.checked) {
      granted.delete(tool.name);
      confirmed.delete(tool.name);
      confirm.hidden = true;
      return;
    }
    if (tool.destructive && !confirmed.has(tool.name)) {
      box.checked = false;
      confirm.hidden = false;
      yes.focus();
      return;
    }
    granted.add(tool.name);
  });
  yes.addEventListener("click", () => {
    confirmed.add(tool.name);
    granted.add(tool.name);
    box.checked = true;
    confirm.hidden = true;
    box.focus();
  });
  no.addEventListener("click", () => {
    confirm.hidden = true;
    box.focus();
  });
  return wrap;
}
