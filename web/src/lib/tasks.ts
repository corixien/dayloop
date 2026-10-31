import type { Task } from "@dayloop/shared";
import type { Item } from "./db";
import { addDays, fmtDate, todayStr } from "./dates";
import { local } from "./app";
import { nextDue } from "./repeat";

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

export async function addTask(data: Partial<Task> & { title: string }): Promise<string> {
  const id = crypto.randomUUID();
  await local.put("task", id, { order: Date.now(), ...data });
  return id;
}

/** Add something that is already done (Have Done entry). */
export const addDoneEntry = (title: string, notes = "") => addTask({ title, notes, done: true, completedAt: Date.now() });

/**
 * Toggle completion. A completed task moves to Have Done; a repeating task rolls its deadline forward and
 * leaves a finished copy behind so the completion shows up in Have Done and the calendar.
 */
export async function toggleDone(t: TaskItem, today = todayStr()): Promise<void> {
  if (t.done) {
    await local.patch("task", t.id, { done: false, completedAt: null });
    return;
  }
  if (t.repeat) {
    const next = nextDue(t.dueDate, t.repeat, today);
    if (next) {
      await addTask({ title: t.title, notes: t.notes, priority: t.priority, done: true, completedAt: Date.now() });
      await local.patch("task", t.id, {
        dueDate: next,
        subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
      });
      return;
    }
  }
  await local.patch("task", t.id, { done: true, completedAt: Date.now() });
}

export const trashTask = (id: string) => local.patch("task", id, { trashedAt: Date.now() });
export const restoreTask = (id: string) => local.patch("task", id, { trashedAt: null });
export const deleteTaskForever = (id: string) => local.remove("task", id);
