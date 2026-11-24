import { fillUiString } from "../fill_ui_string.js";
import type { RoutineSchedule } from "./routines_client.js";
import type { RoutinesStrings } from "./routines_strings.js";
import { MONDAY, weekdayName } from "./utils.js";

/**
 * A routine's schedule in plain words ("Weekdays at 8:00 AM", "Every 3 hours"),
 * naming the routine's own timezone when it is not the viewer's, since a weekly
 * time is wall time there.
 */
export function scheduleInWords(
  schedule: RoutineSchedule,
  timezone: string,
  strings: RoutinesStrings,
  viewerZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
  locale?: string,
): string {
  if (schedule.kind === "interval") {
    return schedule.every_hours === 1
      ? strings.routineHourly
      : fillUiString(strings.routineEveryHours, { n: schedule.every_hours });
  }
  // A time the server would never send reads as midnight rather than throwing in format().
  const clock = /^(\d{1,2}):(\d{2})$/.exec(schedule.at);
  const minutes = clock === null ? 0 : Number(clock[1]) * 60 + Number(clock[2]);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(MONDAY + minutes * 60_000);
  const days = [...new Set(schedule.weekdays)].sort((a, b) => a - b);
  const key = days.join(",");
  let words: string;
  if (key === "0,1,2,3,4,5,6") {
    words = fillUiString(strings.routineDaily, { time });
  } else if (key === "0,1,2,3,4") {
    words = fillUiString(strings.routineWeekdays, { time });
  } else {
    const names = new Intl.ListFormat(locale, { style: "long" }).format(
      days.map((day) => weekdayName(day, locale)),
    );
    words = fillUiString(strings.routineOnDays, { days: names, time });
  }
  return timezone === viewerZone
    ? words
    : fillUiString(strings.routineInZone, { schedule: words, zone: timezone });
}
