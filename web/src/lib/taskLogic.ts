import type { Item } from "./db";
import { noteStats } from "./notes";
import { addDays, fmtDate, todayStr } from "./dates";

export type TaskItem = Item<"task">;

export const isOpen = (t: TaskItem) => !t.done && t.trashedAt === null;
export const isDone = (t: TaskItem) => t.done && t.trashedAt === null;

/** open tasks: by deadline (none last), then priority, then manual order */
export function compareTasks(a: TaskItem, b: TaskItem): number {
  const da = a.dueDate ? a.dueDate + (a.dueTime ?? "00:00") : "9999";
  const db = b.dueDate ? b.dueDate + (b.dueTime ?? "00:00") : "9999";
  if (da !== db) return da < db ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.order - b.order || a.updatedAt - b.updatedAt;
}

export type Group = "overdue" | "today" | "tomorrow" | "later" | "noDate";

export function groupOf(t: TaskItem, today = todayStr()): Group {
  if (!t.dueDate) return "noDate";
  if (t.dueDate < today) return "overdue";
  if (t.dueDate === today) return "today";
  if (t.dueDate === addDays(today, 1)) return "tomorrow";
  return "later";
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
