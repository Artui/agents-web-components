import { describe, expect, it, vi } from "vitest";
import { buildSkillForm } from "../src/ui/skill_editor/build_skill_form.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

const DRAFT = {
  name: "weekly-report",
  description: "Summarise the week.",
  body: "Collect the tickets.",
  userInvocable: true,
  modelInvocable: false,
};

function field(form: HTMLFormElement, key: string): HTMLElement {
  return form.querySelector(`.skill-field[data-field="${key}"]`) as HTMLElement;
}

describe("buildSkillForm", () => {
  it("reads back the draft it was built over, with the two reach switches", () => {
    const built = buildSkillForm(DRAFT, DEFAULT_UI_STRINGS, () => {});
    expect(built.read()).toEqual(DRAFT);
    expect(built.form.querySelector(".skill-field-slash")?.textContent).toBe("/");
    expect(built.form.querySelector("label[for='skill-field-body']")?.textContent).toBe(
      DEFAULT_UI_STRINGS.skillBody,
    );
  });

  it("warns that a skill nobody can reach is unreachable, and stops warning once one switch is on", () => {
    const built = buildSkillForm({ ...DRAFT, userInvocable: false }, DEFAULT_UI_STRINGS, () => {});
    const notice = built.form.querySelector(".skill-notice") as HTMLElement;
    expect(notice.hidden).toBe(false);
    const mayLoad = built.form.querySelectorAll<HTMLInputElement>(".skill-switch input")[1];
    (mayLoad as HTMLInputElement).checked = true;
    mayLoad?.dispatchEvent(new Event("change"));
    expect(notice.hidden).toBe(true);
    expect(built.read().modelInvocable).toBe(true);
  });

  it("submits through onSubmit, never through the page", () => {
    const onSubmit = vi.fn();
    const built = buildSkillForm(DRAFT, DEFAULT_UI_STRINGS, onSubmit);
    const event = new Event("submit", { cancelable: true });
    built.form.dispatchEvent(event);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("moves a refusal from one field to another, clearing the first", () => {
    const built = buildSkillForm(DRAFT, DEFAULT_UI_STRINGS, () => {});
    document.body.append(built.form);
    built.showError("Bad name.", "name");
    expect(field(built.form, "name").classList.contains("skill-field--bad")).toBe(true);
    expect(built.form.querySelector("#skill-field-name")?.getAttribute("aria-invalid")).toBe(
      "true",
    );

    built.showError("Too long.", "body");
    expect(field(built.form, "name").classList.contains("skill-field--bad")).toBe(false);
    expect(built.form.querySelector("#skill-field-name")?.hasAttribute("aria-invalid")).toBe(false);
    expect(field(built.form, "body").querySelector(".skill-field-error")?.textContent).toBe(
      "Too long.",
    );
    expect(document.activeElement?.id).toBe("skill-field-body");
    built.form.remove();
  });

  it("shows a refusal naming a field the form lacks above the fields", () => {
    const built = buildSkillForm(DRAFT, DEFAULT_UI_STRINGS, () => {});
    built.showError("No.", "owner");
    const error = built.form.querySelector(".skill-form-error") as HTMLElement;
    expect([error.hidden, error.textContent]).toEqual([false, "No."]);
  });
});
