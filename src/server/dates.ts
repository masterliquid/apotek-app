import { dayInPharmacyTime } from "./counters";

export class DateRangeError extends Error {}

// Jakarta has no daylight saving, so a pharmacy day is always midnight +07:00 to the next midnight +07:00.
const OFFSET = "+07:00";

export type DateRange = { from: string; to: string; start: Date; endExclusive: Date };

function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DateRangeError("Use dates like 2026-10-29");
  const d = new Date(`${value}T00:00:00${OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new DateRangeError("Invalid date");
  return d;
}

// `from` and `to` are inclusive calendar days in Jakarta time. At most 366 days.
export function dayRange(from: string, to: string): DateRange {
  const start = parseDay(from);
  const endExclusive = new Date(parseDay(to).getTime() + 24 * 60 * 60 * 1000);
  if (endExclusive <= start) throw new DateRangeError("The end date must not be before the start date");
  if (endExclusive.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) throw new DateRangeError("Choose a range of at most one year");
  return { from, to, start, endExclusive };
}

export function todayRange(now = new Date()): DateRange {
  const today = dayInPharmacyTime(now);
  return dayRange(today, today);
}

export function addDays(day: string, days: number): string {
  return dayInPharmacyTime(new Date(parseDay(day).getTime() + days * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000));
}
