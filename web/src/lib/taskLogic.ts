import type { Item } from "./db";
import { noteStats } from "./notes";
import { dueMs, fmtDate } from "./dates";

export type TaskItem = Item<"task">;

export const isOpen = (t: TaskItem) => !t.done && t.trashedAt === null;
/** An appointment appears in the Todo list only shortly before it happens (`showBeforeMin`). */
export const isAppointment = (t: Pick<TaskItem, "showBeforeMin">) => t.showBeforeMin !== null;

export const isDone = (t: TaskItem) => t.done && t.trashedAt === null;

export const DAY_MS = 86_400_000;

/** Deadline as a timestamp; date-only deadlines use the daily reminder hour from the settings. */
export const dueAt = (t: TaskItem, hour: number) => (t.dueDate ? dueMs(t.dueDate, t.dueTime, hour) : null);

/** Due within the next 24 hours (or already overdue): these get their own, highest priority. */
export const isUrgent = (t: TaskItem, now: number, hour: number) => {
  const d = dueAt(t, hour);
  return d !== null && d <= now + DAY_MS;
};

/**
 * The one Todo list: urgent ones (deadline within 24 h or overdue) first by deadline, then everything else
 * by priority, then creation order (oldest first).
 */
export function sortOpen(tasks: TaskItem[], now: number, hour: number): TaskItem[] {
  const key = (t: TaskItem) => dueAt(t, hour) ?? Infinity;
  const shown = (t: TaskItem) => {
    const d = dueAt(t, hour);
    return t.showBeforeMin === null || d === null || now >= d - t.showBeforeMin * 60_000;
  };
  return tasks.filter((t) => isOpen(t) && shown(t)).sort((a, b) => {
    const ua = isUrgent(a, now, hour), ub = isUrgent(b, now, hour);
    if (ua !== ub) return ua ? -1 : 1;
    if (ua) return key(a) - key(b) || b.priority - a.priority || a.order - b.order;
    return b.priority - a.priority || a.order - b.order || a.updatedAt - b.updatedAt;
  });
}

/** The sorted open list in its Todo sections: due within 24 h ("urgent"), then one per priority, oldest first. */
export function groupOpen(sorted: TaskItem[], now: number, hour: number): { key: "urgent" | 3 | 2 | 1 | 0; tasks: TaskItem[] }[] {
  const out: { key: "urgent" | 3 | 2 | 1 | 0; tasks: TaskItem[] }[] = [];
  for (const t of sorted) {
    const key = isUrgent(t, now, hour) ? "urgent" : (t.priority as 0 | 1 | 2 | 3);
    const last = out[out.length - 1];
    if (last?.key === key) last.tasks.push(t);
    else out.push({ key, tasks: [t] });
  }
  return out;
}

/** Local calendar day a task was completed on ("YYYY-MM-DD"), for Have Done and the calendar. */
export const doneDay = (t: Pick<TaskItem, "completedAt" | "updatedAt">) => fmtDate(new Date(t.completedAt ?? t.updatedAt));


/** What a task carries beyond its title: checklist progress (notes lines + legacy subtasks) and plain note text. */
export function extras(t: Pick<TaskItem, "notes" | "subtasks">) {
  const n = noteStats(t.notes);
  return {
    total: n.total + t.subtasks.length,
    done: n.done + t.subtasks.filter((s) => s.done).length,
    note: n.first,
  };
}
