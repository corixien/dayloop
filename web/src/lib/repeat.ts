import type { Repeat } from "@dayloop/shared";
import { addDays, addMonths, diffDays, startOfWeek, todayStr, weekday } from "./dates";

/** Next occurrence strictly after `from`, ignoring `until`. */
function step(from: string, r: Repeat): string {
  const n = r.interval || 1;
  switch (r.freq) {
    case "daily":
      return addDays(from, n);
    case "monthly":
      return addMonths(from, n);
    case "yearly":
      return addMonths(from, 12 * n);
    case "weekly": {
      const days = r.byWeekday?.length ? [...r.byWeekday] : [weekday(from)];
      if (!r.byWeekday?.length) return addDays(from, 7 * n);
      // later weekday in the same (interval-aligned) week first, then jump `n` weeks
      const anchor = startOfWeek(from, 1);
      for (let i = 1; i <= 7 * n + 7; i++) {
        const c = addDays(from, i);
        const weeks = Math.floor(diffDays(startOfWeek(c, 1), anchor) / 7);
        if (days.includes(weekday(c)) && weeks % n === 0) return c;
      }
      return addDays(from, 7 * n);
    }
  }
}

/**
 * Date of the next occurrence after completing a repeating task, or null when the series ended.
 * `base` = due date (or completion day when `fromCompletion`). Skips occurrences before today so a late
 * completion does not leave the task overdue again.
 */
export function nextDue(due: string | null, r: Repeat, today = todayStr()): string | null {
  const base = r.fromCompletion || !due ? today : due;
  let next = step(base, r);
  for (let guard = 0; next < today && guard < 1000; guard++) next = step(next, r);
  if (r.until && next > r.until) return null;
  return next;
}

/** All occurrences of a repeating task inside [from, to] (for the calendar). */
export function occurrences(due: string, r: Repeat, from: string, to: string): string[] {
  const out: string[] = [];
  let d = due;
  for (let guard = 0; d <= to && guard < 2000; guard++) {
    if (r.until && d > r.until) break;
    if (d >= from) out.push(d);
    d = step(d, r);
  }
  return out;
}
