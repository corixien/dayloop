import type { Task } from "@dayloop/shared";
import { addDays, todayStr } from "./dates";
import { local } from "./app";
import { uncheckAll } from "./notes";
import { nextDue } from "./repeat";
import { type TaskItem } from "./taskLogic";

export * from "./taskLogic";

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
        notes: uncheckAll(t.notes),
      });
      return;
    }
  }
  await local.patch("task", t.id, { done: true, completedAt: Date.now() });
}

export const trashTask = (id: string) => local.patch("task", id, { trashedAt: Date.now() });
export const restoreTask = (id: string) => local.patch("task", id, { trashedAt: null });
export const deleteTaskForever = (id: string) => local.remove("task", id);
