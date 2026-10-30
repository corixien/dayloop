import type { Habit } from "@dayloop/shared";
import { addDays, diffDays, weekday } from "./dates";

export const isActive = (h: Pick<Habit, "days" | "startDate">, date: string) => date >= h.startDate && h.days.includes(weekday(date));

export interface HabitStats {
  current: number;
  best: number;
  total: number;
  rate30: number;
}

/** `counts` maps date -> completions. A day counts when count >= target; inactive days neither extend nor break a streak. */
export function habitStats(h: Pick<Habit, "days" | "startDate" | "target">, counts: Map<string, number>, today: string): HabitStats {
  const ok = (d: string) => (counts.get(d) ?? 0) >= h.target;
  let current = 0;
  for (let d = today, i = 0; d >= h.startDate && i < 3650; d = addDays(d, -1), i++) {
    if (!isActive(h, d)) continue;
    if (ok(d)) current++;
    else if (d !== today) break;
  }
  let best = 0, run = 0, total = 0;
  const span = Math.min(diffDays(today, h.startDate), 3650);
  for (let i = 0; i <= span; i++) {
    const d = addDays(h.startDate, i);
    if (!isActive(h, d)) continue;
    if (ok(d)) { run++; total++; best = Math.max(best, run); }
    else if (d !== today) run = 0;
  }
  let active = 0, done = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, -i);
    if (d < h.startDate || !isActive(h, d)) continue;
    if (d === today && !ok(d)) continue;
    active++;
    if (ok(d)) done++;
  }
  return { current, best, total, rate30: active ? Math.round((done / active) * 100) : 0 };
}

/** habitId -> date -> count */
export function habitCounts(logs: { habitId: string; date: string; count: number }[]): Map<string, Map<string, number>> {
  const by = new Map<string, Map<string, number>>();
  for (const l of logs) {
    if (!by.has(l.habitId)) by.set(l.habitId, new Map());
    by.get(l.habitId)!.set(l.date, l.count);
  }
  return by;
}
