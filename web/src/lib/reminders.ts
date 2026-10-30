import type { Habit, Task } from "@dayloop/shared";
import { addDays, dueMs, weekday } from "./dates";
import { occurrences } from "./repeat";

export interface Reminder {
  key: string;
  at: number;
  title: string;
  body: string;
}

type T = Task & { id: string };
type H = Habit & { id: string };

const HOUR = 3600_000;

/** Reminders firing in (now, now+horizon]. Pure: used by the web loop and the native scheduler. */
export function upcomingReminders(
  tasks: T[], habits: H[], counts: Map<string, Map<string, number>>,
  opts: { now: number; horizonMs: number; allDayHour: number; todayStr: string },
): Reminder[] {
  const out: Reminder[] = [];
  const end = opts.now + opts.horizonMs;
  const fromDay = addDays(opts.todayStr, -1);
  const toDay = addDays(opts.todayStr, Math.ceil(opts.horizonMs / (24 * HOUR)) + 1);

  for (const t of tasks) {
    if (t.done || t.trashedAt !== null || !t.dueDate || t.reminders.length === 0) continue;
    const dates = t.repeat ? occurrences(t.dueDate, t.repeat, fromDay, toDay) : [t.dueDate];
    for (const date of dates) {
      for (const r of t.reminders) {
        const at = dueMs(date, t.dueTime, opts.allDayHour) - r.offsetMin * 60_000;
        if (at > opts.now && at <= end) {
          out.push({ key: `task:${t.id}:${date}:${r.offsetMin}`, at, title: t.title, body: t.dueTime ? `${date} ${t.dueTime}` : date });
        }
      }
    }
  }

  for (const h of habits) {
    if (h.archived || !h.reminderTime) continue;
    for (let d = opts.todayStr, i = 0; d <= toDay && i < 15; d = addDays(d, 1), i++) {
      if (d < h.startDate || !h.days.includes(weekday(d))) continue;
      if ((counts.get(h.id)?.get(d) ?? 0) >= h.target) continue;
      const at = dueMs(d, h.reminderTime);
      if (at > opts.now && at <= end) out.push({ key: `habit:${h.id}:${d}`, at, title: h.name, body: "" });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
