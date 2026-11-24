import type { UiStrings } from "../ui_strings.js";

/** The text the routines view and its form draw: a slice of the chat's {@link UiStrings}. */
export type RoutinesStrings = Pick<
  UiStrings,
  | "cancel"
  | "create"
  | "editRoutineTitle"
  | "makeRoutine"
  | "newRoutine"
  | "newRoutineTitle"
  | "noRoutines"
  | "noRoutinesBody"
  | "pause"
  | "resume"
  | "routineAt"
  | "routineDaily"
  | "routineDestructive"
  | "routineEvery"
  | "routineEveryHours"
  | "routineGrant"
  | "routineGrantDestructive"
  | "routineHourly"
  | "routineInZone"
  | "routineInterval"
  | "routineLastFinished"
  | "routineLastLapsed"
  | "routineLastNever"
  | "routineLastPending"
  | "routineLastUnknown"
  | "routineName"
  | "routineNext"
  | "routineNoTools"
  | "routineOnDays"
  | "routinePaused"
  | "routinePausedBecause"
  | "routinePausedStatus"
  | "routinePrompt"
  | "routinePromptHint"
  | "routineResumedStatus"
  | "routineSaveFailed"
  | "routineSaved"
  | "routineSchedule"
  | "routineStarted"
  | "routineTimezone"
  | "routineTools"
  | "routineToolsHint"
  | "routineWeekdays"
  | "routineWeekly"
  | "routines"
  | "routinesUnavailable"
  | "runNow"
  | "save"
>;

/**
 * The routines view's English text, the same values as the chat's table (a
 * test holds them equal), kept apart so an editor element ships without that table.
 */
export const DEFAULT_ROUTINES_STRINGS: RoutinesStrings = {
  cancel: "Cancel",
  create: "Create",
  editRoutineTitle: "Edit routine",
  makeRoutine: "Make this a routine",
  newRoutine: "New routine",
  newRoutineTitle: "New routine",
  noRoutines: "No routines yet",
  noRoutinesBody:
    "A routine asks the agent the same thing on a schedule. Each run is a conversation of its own.",
  pause: "Pause",
  resume: "Resume",
  routineAt: "At",
  routineDaily: "Every day at {time}",
  routineDestructive: "Destructive",
  routineEvery: "Every (hours)",
  routineEveryHours: "Every {n} hours",
  routineGrant: "Grant",
  routineGrantDestructive:
    "{name} is destructive: every run may use it without asking you. Grant it anyway?",
  routineHourly: "Every hour",
  routineInZone: "{schedule} ({zone})",
  routineInterval: "Every few hours",
  routineLastFinished: "Finished",
  routineLastLapsed: "Lapsed",
  routineLastNever: "Not run yet",
  routineLastPending: "Running",
  routineLastUnknown: "Ran",
  routineName: "Name",
  routineNext: "Next {time}",
  routineNoTools: "This agent has no tools to pre-approve.",
  routineOnDays: "{days} at {time}",
  routinePaused: "Paused",
  routinePausedBecause: "Paused: {reason}",
  routinePausedStatus: "{name} is paused",
  routinePrompt: "Prompt",
  routinePromptHint: "What the agent is asked each time the routine runs.",
  routineResumedStatus: "{name} is on again",
  routineSaveFailed: "The routine could not be saved.",
  routineSaved: "Saved {name}",
  routineSchedule: "When it runs",
  routineStarted: "{name} is running",
  routineTimezone: "Timezone",
  routineTools: "Pre-approved tools",
  routineToolsHint: "A run uses these without asking. Every other tool still waits for you.",
  routineWeekdays: "Weekdays at {time}",
  routineWeekly: "On days of the week",
  routines: "Routines",
  routinesUnavailable: "Routines could not be loaded.",
  runNow: "Run now",
  save: "Save",
};
