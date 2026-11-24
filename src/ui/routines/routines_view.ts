import { ICON_PLUS } from "../../constants.js";
import { fillUiString } from "../fill_ui_string.js";
import { headerButton } from "../shell/header_button.js";
import type { PanelView } from "../shell/panel_view.js";
import type { UiStrings } from "../ui_strings.js";
import { buildRoutineForm } from "./build_routine_form.js";
import type {
  GrantableTool,
  Routine,
  RoutineDraft,
  RoutineRun,
  RoutinesClient,
} from "./routines_client.js";
import { scheduleInWords } from "./schedule_in_words.js";

/** What the routines view needs from the element that owns it. */
export interface RoutinesViewHost {
  /** The full-panel view the routines draw into. */
  readonly view: PanelView;
  /** The element whose light-DOM children may fill the form's named slots. */
  readonly element: HTMLElement;
  readonly strings: () => UiStrings;
  /** The prompt and a name the conversation on screen suggests, or `null` when it has none. */
  readonly fromConversation: () => { readonly prompt: string; readonly name: string } | null;
  /** Leave the view for a thread a routine ran in. */
  readonly onOpenThread: (threadId: string) => void;
  /** Leave the view for the conversation. */
  readonly onClose: () => void;
}

/**
 * The caller's routines, drawn into a {@link PanelView}: each with its
 * schedule in words, next run and last result, Pause or Resume and Run now,
 * and a form to create or edit one.
 *
 * The server owns every rule; a refusal is shown as it was worded. A
 * generation number drops any answer that lands after the view was reset or
 * reopened, so a slow list for one principal never paints for the next.
 */
export class RoutinesView {
  readonly #host: RoutinesViewHost;
  #routines: readonly Routine[] = [];
  #grantable: readonly GrantableTool[] = [];
  #last = new Map<string, RoutineRun | null>();
  #screen: "closed" | "list" | "edit" = "closed";
  #generation = 0;
  #client: RoutinesClient | null = null;

  constructor(host: RoutinesViewHost) {
    this.#host = host;
  }

  /** Whether the view is showing. */
  get isOpen(): boolean {
    return this.#screen !== "closed";
  }

  /** Open on the list, loaded fresh through `client`. */
  open(client: RoutinesClient): void {
    this.#begin(client);
    void this.#loadList(false);
  }

  /** Open on a new routine's form, its prompt and name taken from the conversation. */
  openFromConversation(client: RoutinesClient): void {
    this.#begin(client);
    void this.#loadList(true);
  }

  /** Step back: from the form to the list, from the list to the conversation. */
  back(): void {
    if (this.#screen === "edit") {
      this.#screen = "list";
      this.#drawList();
      return;
    }
    this.#host.onClose();
  }

  /** Forget everything the view held and stop any answer in flight. */
  reset(): void {
    this.#generation += 1;
    this.#routines = [];
    this.#grantable = [];
    this.#last = new Map();
    this.#client = null;
    this.#screen = "closed";
  }

  #begin(client: RoutinesClient): void {
    this.reset();
    this.#client = client;
    this.#screen = "list";
  }

  async #loadList(fromConversation: boolean): Promise<void> {
    const generation = this.#generation;
    const client = this.#client as RoutinesClient;
    const result = await client.list();
    if (generation !== this.#generation) {
      return;
    }
    if (!result.ok) {
      const strings = this.#host.strings();
      const line = document.createElement("p");
      line.className = "skill-editor-unavailable";
      line.setAttribute("role", "alert");
      line.textContent = strings.routinesUnavailable;
      this.#host.view.show({ title: strings.routines, body: [line] });
      return;
    }
    this.#routines = result.value.routines;
    this.#grantable = result.value.grantable;
    const seed = fromConversation ? this.#host.fromConversation() : null;
    if (seed === null) {
      this.#drawList();
    } else {
      this.#edit(null, seed);
    }
    for (const routine of this.#routines) {
      void client.runs(routine.id).then((runs) => {
        if (generation !== this.#generation || !runs.ok) {
          return;
        }
        this.#last.set(routine.id, runs.value[0] ?? null);
        if (this.#screen === "list") {
          this.#drawList();
        }
      });
    }
  }

  #drawList(): void {
    const strings = this.#host.strings();
    const add = headerButton("new-routine", strings.newRoutine, ICON_PLUS);
    add.addEventListener("click", () => this.#edit(null, null));
    const footer: HTMLElement[] = [];
    if (this.#host.fromConversation() !== null) {
      const make = document.createElement("button");
      make.type = "button";
      make.className = "skill-editor-btn skill-editor-btn--block";
      make.setAttribute("part", "make-routine");
      make.textContent = strings.makeRoutine;
      make.addEventListener("click", () => this.#edit(null, this.#host.fromConversation()));
      footer.push(make);
    }
    if (this.#routines.length === 0) {
      const wrap = document.createElement("div");
      wrap.className = "skill-empty";
      wrap.setAttribute("part", "routine-empty");
      const heading = document.createElement("h3");
      heading.textContent = strings.noRoutines;
      const text = document.createElement("p");
      text.textContent = strings.noRoutinesBody;
      wrap.append(heading, text);
      this.#host.view.show({ title: strings.routines, actions: [add], body: [wrap], footer });
      return;
    }
    const rows = document.createElement("div");
    rows.className = "skill-rows";
    rows.setAttribute("part", "routine-rows");
    for (const routine of this.#routines) {
      rows.append(this.#row(routine));
    }
    this.#host.view.show({
      title: strings.routines,
      sub: String(this.#routines.length),
      actions: [add],
      body: [rows],
      footer,
    });
  }

  #row(routine: Routine): HTMLElement {
    const strings = this.#host.strings();
    const row = document.createElement("div");
    row.className = routine.enabled
      ? "skill-row routine-row"
      : "skill-row routine-row skill-row--off";
    row.setAttribute("part", "routine-row");
    row.dataset["routineId"] = routine.id;
    const open = document.createElement("button");
    open.type = "button";
    open.className = "skill-row-open";
    const name = document.createElement("span");
    name.className = "skill-row-name routine-row-name";
    name.textContent = routine.name;
    const schedule = document.createElement("span");
    schedule.className = "skill-row-desc routine-schedule";
    schedule.textContent = scheduleInWords(routine.schedule, routine.timezone, strings);
    const next = document.createElement("span");
    next.className = "routine-next";
    next.textContent = nextInWords(routine, strings);
    const meta = document.createElement("span");
    meta.className = "skill-row-meta";
    meta.append(next);
    open.append(name, schedule, meta);
    open.addEventListener("click", () => this.#edit(routine, null));

    const last = this.#last.get(routine.id);
    const lastText = lastInWords(routine, last, strings);
    const threadId = last?.threadId ?? routine.lastThreadId;
    const result = document.createElement(threadId === null ? "span" : "button");
    result.className = "routine-last";
    result.setAttribute("part", "routine-last");
    result.textContent = lastText;
    if (result instanceof HTMLButtonElement && threadId !== null) {
      result.type = "button";
      result.addEventListener("click", () => this.#host.onOpenThread(threadId));
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "skill-editor-btn skill-editor-btn--ghost";
    toggle.setAttribute("part", "routine-toggle");
    toggle.textContent = routine.enabled ? strings.pause : strings.resume;
    toggle.addEventListener("click", () => {
      void this.#setEnabled(routine, !routine.enabled);
    });
    const run = document.createElement("button");
    run.type = "button";
    run.className = "skill-editor-btn skill-editor-btn--ghost";
    run.setAttribute("part", "routine-run");
    run.textContent = strings.runNow;
    run.addEventListener("click", () => {
      void this.#runNow(routine);
    });
    const actions = document.createElement("div");
    actions.className = "routine-actions";
    actions.append(result, toggle, run);
    row.append(open, actions);
    return row;
  }

  #edit(routine: Routine | null, seed: { readonly prompt: string; readonly name: string } | null) {
    const strings = this.#host.strings();
    this.#screen = "edit";
    const tools = this.#tools(routine);
    const draft: RoutineDraft =
      routine === null
        ? {
            name: seed?.name ?? "",
            prompt: seed?.prompt ?? "",
            schedule: { kind: "weekly", weekdays: [0, 1, 2, 3, 4], at: "09:00" },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            enabled: true,
            preapprovedTools: [],
            confirmDestructive: [],
          }
        : {
            name: routine.name,
            prompt: routine.prompt,
            schedule: routine.schedule,
            timezone: routine.timezone,
            enabled: routine.enabled,
            preapprovedTools: routine.preapprovedTools.map((tool) => tool.name),
            confirmDestructive: routine.preapprovedTools
              .filter((tool) => tool.destructive)
              .map((tool) => tool.name),
          };
    const save = document.createElement("button");
    const form = buildRoutineForm(draft, tools, strings, () => save.click());
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "skill-editor-btn skill-editor-btn--ghost";
    cancel.textContent = strings.cancel;
    cancel.addEventListener("click", () => this.back());
    save.type = "button";
    save.className = "skill-editor-btn skill-editor-btn--primary";
    save.textContent = routine === null ? strings.create : strings.save;
    save.addEventListener("click", () => {
      void this.#save(routine, form.read(), (message) => form.showError(message));
    });
    const grow = document.createElement("span");
    grow.className = "skill-editor-grow";
    this.#host.view.show({
      title: routine === null ? strings.newRoutineTitle : strings.editRoutineTitle,
      ...(routine === null ? {} : { sub: routine.name }),
      body: [form.form],
      footer: [grow, cancel, save],
    });
  }

  /** The mount's grantable tools and any the routine holds that the mount no longer lists. */
  #tools(routine: Routine | null): GrantableTool[] {
    const flags = new Map<string, boolean>();
    for (const tool of [...this.#grantable, ...(routine?.preapprovedTools ?? [])]) {
      flags.set(tool.name, (flags.get(tool.name) ?? false) || tool.destructive);
    }
    return [...flags].map(([name, destructive]) => ({ name, destructive }));
  }

  async #save(
    routine: Routine | null,
    draft: RoutineDraft,
    refused: (message: string) => void,
  ): Promise<void> {
    const client = this.#client as RoutinesClient;
    const generation = this.#generation;
    const result =
      routine === null ? await client.create(draft) : await client.update(routine.id, draft);
    if (generation !== this.#generation) {
      return;
    }
    if (!result.ok) {
      refused(result.message ?? this.#host.strings().routineSaveFailed);
      return;
    }
    this.#landed(result.value, this.#host.strings().routineSaved);
  }

  async #setEnabled(routine: Routine, enabled: boolean): Promise<void> {
    const client = this.#client as RoutinesClient;
    const generation = this.#generation;
    const result = await client.setEnabled(routine.id, enabled);
    if (generation !== this.#generation) {
      return;
    }
    const strings = this.#host.strings();
    if (!result.ok) {
      this.#host.view.announce(result.message ?? strings.routineSaveFailed);
      return;
    }
    this.#landed(
      result.value,
      enabled ? strings.routineResumedStatus : strings.routinePausedStatus,
      false,
    );
  }

  async #runNow(routine: Routine): Promise<void> {
    const client = this.#client as RoutinesClient;
    const generation = this.#generation;
    const result = await client.runNow(routine.id);
    if (generation !== this.#generation) {
      return;
    }
    const strings = this.#host.strings();
    if (!result.ok) {
      this.#host.view.announce(result.message ?? strings.routineSaveFailed);
      return;
    }
    this.#last.set(routine.id, { threadId: result.value, state: "pending" });
    if (this.#screen === "list") {
      this.#drawList();
    }
    this.#host.view.announce(fillUiString(strings.routineStarted, { name: routine.name }));
  }

  /** A write the server accepted: the list takes its answer; a toggle never leaves an open form. */
  #landed(saved: Routine, template: string, leaveForm = true): void {
    const known = this.#routines.some((routine) => routine.id === saved.id);
    this.#routines = known
      ? this.#routines.map((routine) => (routine.id === saved.id ? saved : routine))
      : [saved, ...this.#routines];
    if (leaveForm) {
      this.#screen = "list";
    }
    if (this.#screen === "list") {
      this.#drawList();
    }
    this.#host.view.announce(fillUiString(template, { name: saved.name }));
  }
}

function nextInWords(routine: Routine, strings: UiStrings): string {
  if (!routine.enabled || routine.nextFireAt === null) {
    return routine.pausedReason === ""
      ? strings.routinePaused
      : fillUiString(strings.routinePausedBecause, { reason: routine.pausedReason });
  }
  const time = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(routine.nextFireAt));
  return fillUiString(strings.routineNext, { time });
}

function lastInWords(
  routine: Routine,
  last: RoutineRun | null | undefined,
  strings: UiStrings,
): string {
  const state = last?.state ?? null;
  if (state === "pending") {
    return strings.routineLastPending;
  }
  if (state === "lapsed") {
    return strings.routineLastLapsed;
  }
  if (state === "finished") {
    return strings.routineLastFinished;
  }
  return (last ?? null) === null && routine.lastThreadId === null
    ? strings.routineLastNever
    : strings.routineLastUnknown;
}
