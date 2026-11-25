/**
 * Task-controlled delegations, as django-ag-ui streams them.
 *
 * `tests/fixtures/subagent_task_control.json` is written by
 * `scripts/record_task_control_fixture.py`, which drives the real
 * `DjangoAGUIView` with `SubAgents(task_control=TaskControl())` and decodes the
 * Server-Sent Events its own encoder wrote. Regenerate it, never edit it. Each
 * run is one scenario: `steered`, `question`, `cancelled`, `resumed`, and
 * `unfinished` (the parent's model fails while a background task is open). The
 * `retried` value is the producer's own `subagent_progress` encoder, since only
 * a remote task's worker retries. Only timestamps and random ids are settled.
 */

import fixture from "../fixtures/subagent_task_control.json";

/** One decoded AG-UI event, read only through the fields a caller names. */
export type TaskEvent = Readonly<Record<string, unknown>>;

/** The recorded scenarios, by name. */
export type TaskRun = keyof typeof fixture.runs;

/** Every event of one recorded run, in wire order. */
export function taskRun(name: TaskRun): readonly TaskEvent[] {
  return fixture.runs[name] as readonly TaskEvent[];
}

/** Every `ag_ui.subagent` value one run carried, in wire order. */
export function taskSteps(name: TaskRun): readonly Record<string, unknown>[] {
  return taskRun(name)
    .filter((event) => event["type"] === "CUSTOM" && event["name"] === "ag_ui.subagent")
    .map((event) => event["value"] as Record<string, unknown>);
}

/** The one step of `name` in `phase`; throws unless there is exactly one. */
export function taskStep(name: TaskRun, phase: string): Record<string, unknown> {
  const found = taskSteps(name).filter((value) => value["phase"] === phase);
  if (found.length !== 1) {
    throw new Error(`expected one ${phase} step in the ${name} run, found ${found.length}`);
  }
  return found[0] as Record<string, unknown>;
}

/** The lifecycle events of one run, in wire order. */
export function taskLifecycle(name: TaskRun): readonly TaskEvent[] {
  return taskRun(name).filter((event) => String(event["type"]).startsWith("SUBAGENT_"));
}

/** A `retried` step, from the producer's encoder. */
export const RETRIED_STEP: Record<string, unknown> = fixture.retried.value;

/** The steps a task route reports, from the producer's encoder: `source` is `"user"`. */
export const USER_STEP: Readonly<
  Record<"steered" | "answered" | "cancel_requested", Record<string, unknown>>
> = {
  steered: fixture.byUser.steered.value,
  answered: fixture.byUser.answered.value,
  cancel_requested: fixture.byUser.cancel_requested.value,
};
