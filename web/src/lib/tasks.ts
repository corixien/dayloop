import type { Task } from "@dayloop/shared";
import type { Item } from "./db";
import { addDays, todayStr } from "./dates";
import { local } from "./app";
import { nextDue } from "./repeat";

export type TaskItem = Item<"task">;

/** A view is a route: smart list, list or tag. */
export type View =
  | { kind: "smart"; id: "inbox" | "today" | "next7" | "all" | "done" | "trash" }
  | { kind: "list"; id: string }
  | { kind: "tag"; id: string };

export function matches(t: TaskItem, v: View, today = todayStr()): boolean {
  if (v.kind === "smart" && v.id === "trash") return t.trashedAt !== null;
  if (t.trashedAt !== null) return false;
  switch (v.kind) {
    case "smart":
      switch (v.id) {
        case "inbox": return !t.done && t.listId === null;
        case "today": return !t.done && t.dueDate !== null && t.dueDate <= today;
        case "next7": return !t.done && t.dueDate !== null && t.dueDate >= today && t.dueDate <= addDays(today, 6);
        case "all": return !t.done;
        case "done": return t.done;
      }
      return false;
    case "list": return t.listId === v.id;
    case "tag": return t.tags.includes(v.id);
  }
}

/** open tasks: by due date (none last), then priority, then manual order */
export function compareTasks(a: TaskItem, b: TaskItem): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done && b.done) return (b.completedAt ?? 0) - (a.completedAt ?? 0);
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

export async function addTask(data: Partial<Task> & { title: string }): Promise<string> {
  const id = crypto.randomUUID();
  await local.put("task", id, { order: Date.now(), ...data });
  return id;
}

/** Toggle completion; repeating tasks roll forward to the next occurrence instead. */
export async function toggleDone(t: TaskItem, today = todayStr()): Promise<void> {
  if (t.done) {
    await local.patch("task", t.id, { done: false, completedAt: null });
    return;
  }
  if (t.repeat) {
    const next = nextDue(t.dueDate, t.repeat, today);
    if (next) {
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

export type Quadrant = 1 | 2 | 3 | 4;

/** Eisenhower: important = priority medium/high, urgent = due today or overdue. */
export function quadrantOf(t: TaskItem, today = todayStr()): Quadrant {
  const important = t.priority >= 2;
  const urgent = t.dueDate !== null && t.dueDate <= today;
  return important ? (urgent ? 1 : 2) : urgent ? 3 : 4;
}

/** Moving a task to a quadrant edits priority and due date so the quadrant sticks. */
export async function moveToQuadrant(t: TaskItem, q: Quadrant, today = todayStr()): Promise<void> {
  const important = q === 1 || q === 2;
  const urgent = q === 1 || q === 3;
  const patch: Partial<Task> = {};
  if (important && t.priority < 2) patch.priority = 3;
  if (!important && t.priority >= 2) patch.priority = 1;
  if (urgent && !(t.dueDate && t.dueDate <= today)) patch.dueDate = today;
  if (!urgent && t.dueDate !== null && t.dueDate <= today) patch.dueDate = addDays(today, 7);
  if (Object.keys(patch).length) await local.patch("task", t.id, patch);
}
