/** 2024-01-01 was a Monday, the wire's day 0. */
export const MONDAY = Date.UTC(2024, 0, 1);
export const DAY_MS = 86_400_000;

/** The short name of the wire's weekday `day` (0 is Monday, 6 Sunday), in `locale`. */
export function weekdayName(day: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(
    MONDAY + day * DAY_MS,
  );
}
