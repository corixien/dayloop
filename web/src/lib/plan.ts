import { useMemo } from "react";
import { local, uid, useItems } from "./app";
import { type Block, type EntryView, type TaskRef, byStart, resolveEntries } from "./planLogic";
import { addTask, toggleDone } from "./tasks";
import { appendPoint, ensurePointId, formatNotes, parseNotes, removePoint } from "./notes";

export const usePlan = (date: string): Block[] =>
  useItems("plan").filter((x) => x.date === date).map((x) => ({ id: x.id, title: x.title, notes: x.notes, date: x.date, start: x.start, end: x.end, entries: x.entries })).sort(byStart);

export const savePlan = (b: Omit<Block, "id" | "entries"> & { id?: string; entries?: Block["entries"] }) =>
  local.put("plan", b.id ?? uid(), { title: b.title, notes: b.notes, date: b.date, start: b.start, end: b.end, entries: b.entries ?? [] });
export const deletePlan = (id: string) => local.remove("plan", id);

/** All todos by id (trashed ones included, the resolver drops them). */
export function useTaskRefs(): Map<string, TaskRef> {
  const tasks = useItems("task");
  return useMemo(() => new Map(tasks.map((t) => [t.id, { id: t.id, title: t.title, notes: t.notes, done: t.done, priority: t.priority, order: t.order, trashedAt: t.trashedAt }])), [tasks]);
}

export const useEntryViews = (entries: Block["entries"]): EntryView[] => {
  const refs = useTaskRefs();
  return useMemo(() => resolveEntries(entries, refs), [entries, refs]);
};

/** Give every checklist point of a todo an id (once), so plan blocks and the MCP can address them. */
export async function ensurePointIds(taskId: string): Promise<void> {
  const t = await local.get("task", taskId);
  if (!t) return;
  let notes = t.notes;
  parseNotes(notes).forEach((l, i) => { if (l.check && !l.id) notes = ensurePointId(notes, i).notes; });
  if (notes !== t.notes) await local.patch("task", taskId, { notes });
}

/** Tick a point of a todo from the plan: by id when it has one, else by its position in the notes. */
export async function tickPoint(taskId: string, p: { id?: string; index: number }, done: boolean): Promise<void> {
  const t = await local.get("task", taskId);
  if (!t) return;
  const lines = parseNotes(t.notes);
  const i = p.id ? lines.findIndex((l) => l.check && l.id === p.id) : p.index;
  const l = lines[i];
  if (!l?.check || l.done === done) return;
  lines[i] = done ? { ...l, done: true, at: Date.now() } : { check: true, done: false, ...(l.id ? { id: l.id } : {}), text: l.text };
  await local.patch("task", taskId, { notes: formatNotes(lines) });
}

/** Complete / reopen a todo from the plan (repeating todos roll forward like everywhere else). */
export async function toggleTaskById(taskId: string): Promise<void> {
  const t = await local.get("task", taskId);
  if (t) await toggleDone(t);
}

/** New point on a real todo (from the plan). Returns its id. */
export async function addPoint(taskId: string, text: string): Promise<string | null> {
  const t = await local.get("task", taskId);
  const title = text.trim();
  if (!t || !title) return null;
  const r = appendPoint(t.notes, title);
  await local.patch("task", taskId, { notes: r.notes });
  return r.id;
}

/** Delete a point of a real todo (from the plan). */
export async function deletePoint(taskId: string, p: { id?: string; index: number }): Promise<void> {
  const t = await local.get("task", taskId);
  if (!t) return;
  const notes = removePoint(t.notes, p);
  if (notes !== t.notes) await local.patch("task", taskId, { notes });
}

/** A block that only shows some points of a todo also shows a point that was just added there. */
export async function showPoint(blockId: string, taskId: string, pointId: string): Promise<void> {
  const b = await local.get("plan", blockId);
  if (!b) return;
  const entries = b.entries.map((e) => (e.taskId === taskId && e.points && !e.points.includes(pointId) ? { ...e, points: [...e.points, pointId] } : e));
  await local.patch("plan", blockId, { entries });
}

