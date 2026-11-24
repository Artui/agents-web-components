import { afterEach, describe, expect, it } from "vitest";
import { buildRoutineForm, type RoutineForm } from "../src/ui/routines/build_routine_form.js";
import type { RoutineDraft } from "../src/ui/routines/routines_client.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

const VIEWER = Intl.DateTimeFormat().resolvedOptions().timeZone;

function draft(at: string, timezone = "Europe/Paris"): RoutineDraft {
  return {
    name: "standup",
    prompt: "Summarise yesterday.",
    schedule: { kind: "weekly", weekdays: [0, 1], at },
    timezone,
    enabled: true,
    preapprovedTools: [],
    confirmDestructive: [],
  };
}

function select(form: RoutineForm, selector: string): HTMLSelectElement {
  return form.form.querySelector(selector) as HTMLSelectElement;
}

function minutes(form: RoutineForm): string[] {
  return [...select(form, "#routine-field-at-minute").options].map((option) => option.value);
}

/** Mount `form` inside a host's shadow root, the way the element shows it, with `children` slotted. */
async function mounted(
  build: () => RoutineForm,
  attrs: Record<string, string> = {},
  children: HTMLElement[] = [],
): Promise<{ form: RoutineForm; host: HTMLElement }> {
  const host = document.createElement("div");
  for (const [key, value] of Object.entries(attrs)) {
    host.setAttribute(key, value);
  }
  host.append(...children);
  const root = host.attachShadow({ mode: "open" });
  document.body.append(host);
  const form = build();
  root.append(form.form);
  await Promise.resolve();
  return { form, host };
}

function option(value: string): HTMLOptionElement {
  const choice = document.createElement("option");
  choice.value = value;
  choice.textContent = value;
  return choice;
}

function plugged(slot: string, values: string[]): HTMLSelectElement {
  const control = document.createElement("select");
  control.slot = slot;
  for (const value of values) {
    control.append(option(value));
  }
  return control;
}

const build = (at: string, timezone?: string) => () =>
  buildRoutineForm(draft(at, timezone), [], DEFAULT_UI_STRINGS, () => {});

describe("buildRoutineForm's time and timezone fields", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("draws the time as an hour and a minute select in one labelled group, no native time input", async () => {
    const { form } = await mounted(build("07:15"));
    expect(form.form.querySelector("input[type='time']")).toBeNull();
    const group = form.form.querySelector("[role='group']") as HTMLElement;
    const caption = form.form.querySelector(`#${group.getAttribute("aria-labelledby")}`);
    expect(caption?.textContent).toBe("At");
    const [hour, minute] = [...group.querySelectorAll("select")];
    expect([hour?.getAttribute("aria-label"), minute?.getAttribute("aria-label")]).toEqual([
      "Hour",
      "Minute",
    ]);
    expect([...(hour as HTMLSelectElement).options].map((option) => option.value)).toHaveLength(24);
    expect(minutes(form)).toEqual(
      Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")),
    );
    expect(form.read().schedule).toEqual({ kind: "weekly", weekdays: [0, 1], at: "07:15" });
    (hour as HTMLSelectElement).value = "23";
    (minute as HTMLSelectElement).value = "55";
    expect(form.read().schedule).toEqual({ kind: "weekly", weekdays: [0, 1], at: "23:55" });
  });

  it("keeps a minute off the step as its own option rather than rounding it", async () => {
    const { form } = await mounted(build("08:07"));
    expect(minutes(form)).toContain("07");
    expect(minutes(form).indexOf("07")).toBe(2);
    expect(form.read().schedule).toMatchObject({ at: "08:07" });
  });

  it.each([
    ["15", ["00", "15", "30", "45"]],
    ["0", null],
    ["7.5", null],
    ["31", null],
    ["soon", null],
  ])("reads data-routine-minute-step=%s from the host when the form opens", async (step, want) => {
    const { form } = await mounted(build("09:30"), { "data-routine-minute-step": step });
    expect(minutes(form)).toEqual(
      want ?? Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0")),
    );
    expect(form.read().schedule).toMatchObject({ at: "09:30" });
  });

  it("keeps the off-step minute when a host step rebuilds the minutes", async () => {
    const { form } = await mounted(build("09:20"), { "data-routine-minute-step": "15" });
    expect(minutes(form)).toEqual(["00", "15", "20", "30", "45"]);
    expect(form.read().schedule).toMatchObject({ at: "09:20" });
  });

  it("keeps the default step when the form is never shown in a shadow root", async () => {
    const form = build("10:00")();
    document.body.append(form.form);
    await Promise.resolve();
    expect(minutes(form)).toHaveLength(12);
  });

  it("offers the browser's IANA zones, the routine's and the viewer's among them", async () => {
    const { form } = await mounted(build("09:00", "Asia/Calcutta"));
    const zone = form.form.querySelector("#routine-field-timezone") as HTMLInputElement;
    expect(zone.type).toBe("text");
    const label = form.form.querySelector("label[for='routine-field-timezone']");
    expect(label?.textContent).toBe("Timezone");
    const offered = [...(zone.list?.options ?? [])].map((option) => option.value);
    expect(offered).toEqual(expect.arrayContaining(["Europe/Paris", "Asia/Calcutta", VIEWER]));
    expect(new Set(offered).size).toBe(offered.length);
    expect(form.read().timezone).toBe("Asia/Calcutta");
  });

  it("defaults an empty zone to the viewer's", async () => {
    const { form } = await mounted(build("09:00", ""));
    expect(form.read().timezone).toBe(VIEWER);
  });

  it("writes the routine's values into slotted controls and saves what they hold", async () => {
    const time = plugged("routine-time", ["06:00", "08:07", "18:00"]);
    const zone = plugged("routine-timezone", ["UTC", "Europe/Paris", "Asia/Tokyo"]);
    const { form, host } = await mounted(build("08:07"), {}, [time, zone]);
    const slots = [...form.form.querySelectorAll("slot")].map((slot) => slot.name);
    expect(slots).toEqual(["routine-time", "routine-timezone"]);
    expect([time.value, zone.value]).toEqual(["08:07", "Europe/Paris"]);
    time.value = "18:00";
    zone.value = "Asia/Tokyo";
    expect(form.read()).toMatchObject({
      schedule: { kind: "weekly", at: "18:00" },
      timezone: "Asia/Tokyo",
    });
    const late = plugged("routine-time", ["08:07", "21:00"]);
    time.remove();
    host.append(late);
    const slot = form.form.querySelector("slot[name='routine-time']") as HTMLSlotElement;
    slot.dispatchEvent(new Event("slotchange"));
    expect(late.value).toBe("08:07");
    late.value = "21:00";
    slot.dispatchEvent(new Event("slotchange"));
    expect(late.value).toBe("21:00");
    expect(form.read().schedule).toMatchObject({ at: "21:00" });
  });
});
