import { describe, expect, it } from "vitest";
import { scheduleInWords } from "../src/ui/routines/schedule_in_words.js";
import { weekdayName } from "../src/ui/routines/utils.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

const S = DEFAULT_UI_STRINGS;
const weekly = (weekdays: number[], at = "08:00") => ({ kind: "weekly", weekdays, at }) as const;
const words = (schedule: Parameters<typeof scheduleInWords>[0], zone = "Europe/Paris") =>
  scheduleInWords(schedule, zone, S, "Europe/Paris", "en-US");

describe("scheduleInWords", () => {
  it("names the wire's weekdays Monday first: 0 is Monday and 6 is Sunday", () => {
    expect(weekdayName(0, "en-US")).toBe("Mon");
    expect(weekdayName(6, "en-US")).toBe("Sun");
    expect(words(weekly([6, 0], "18:05"))).toBe("Mon and Sun at 6:05 PM");
  });

  it("says weekdays for Monday to Friday and every day for all seven, in any order", () => {
    expect(words(weekly([4, 3, 2, 1, 0]))).toBe("Weekdays at 8:00 AM");
    expect(words(weekly([0, 1, 2, 3, 4, 5, 6, 6]))).toBe("Every day at 8:00 AM");
    expect(words(weekly([0, 2, 4]))).toBe("Mon, Wed, and Fri at 8:00 AM");
  });

  it("says an interval in hours, one hour in its own words", () => {
    expect(words({ kind: "interval", every_hours: 1 })).toBe("Every hour");
    expect(words({ kind: "interval", every_hours: 6 })).toBe("Every 6 hours");
  });

  it("names the routine's timezone when it is not the viewer's, since the time is wall time there", () => {
    expect(words(weekly([0]), "America/New_York")).toBe("Mon at 8:00 AM (America/New_York)");
    expect(words({ kind: "interval", every_hours: 2 }, "UTC")).toBe("Every 2 hours");
  });

  it("reads a malformed time as midnight rather than throwing, and defaults to the viewer's zone", () => {
    expect(
      scheduleInWords(weekly([0], "8 o'clock"), "Europe/Paris", S, "Europe/Paris", "en-US"),
    ).toBe("Mon at 12:00 AM");
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(scheduleInWords(weekly([0, 1, 2, 3, 4]), zone, S)).not.toContain("(");
  });
});
