/** Pure helpers for the Plan page (time blocks of one day). Times are "HH:MM", minutes are 0..1439. */

export const DAY_MIN = 1440;
export const toMin = (hm: string): number => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
export const fromMin = (m: number): string => {
  const c = Math.max(0, Math.min(DAY_MIN - 1, Math.round(m)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

import type { PlanEntry } from "@dayloop/shared";
import { parseNotes, stripMarks } from "./notes";

export interface Block { id: string; title: string; notes: string; date: string; start: string; end: string; entries: PlanEntry[] }

export const byStart = <T extends { start: string; end: string }>(a: T, b: T) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end);

/**
 * Default start of a new block: right after the last block that ends at or before "now" or, if nothing is planned later,
 * the current time (rounded down to 5 min). Looking at another day: after its last block, else 08:00.
 */
export function nextStart(blocks: { start: string; end: string }[], nowMin: number | null): string {
  const lastEnd = blocks.reduce((m, b) => Math.max(m, toMin(b.end)), -1);
  if (nowMin === null) return fromMin(lastEnd >= 0 ? lastEnd : 8 * 60);
  const now = Math.floor(nowMin / 5) * 5;
  return fromMin(Math.max(lastEnd, now));
}

/** End of a new block: one hour after the start, clamped to the end of the day. */
export const defaultEnd = (start: string, minutes = 60): string => fromMin(Math.min(toMin(start) + minutes, DAY_MIN - 1));

/** Problem with a start/end pair, or null when valid. */
export const checkRange = (start: string, end: string): "format" | "order" | null => {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!re.test(start) || !re.test(end)) return "format";
  return toMin(end) > toMin(start) ? null : "order";
};

/* ---- todos inside a block: block -> todo -> checklist points; the plan only stores references ---- */

export interface TaskRef { id: string; title: string; notes: string; done: boolean; trashedAt: number | null }
export interface PointView { id?: string; index: number; text: string; done: boolean }
export interface EntryView { task: TaskRef; points: PointView[] }

/** The entries of a block with live data from the todos. Trashed or deleted todos drop out; a point that is gone drops out. */
export function resolveEntries(entries: PlanEntry[], tasks: Map<string, TaskRef>): EntryView[] {
  const out: EntryView[] = [];
  for (const e of entries) {
    const task = tasks.get(e.taskId);
    if (!task || task.trashedAt !== null) continue;
    const all = parseNotes(task.notes).map((l, index) => ({ l, index })).filter((x) => x.l.check);
    const pick = e.points === null ? all : all.filter((x) => x.l.id && e.points!.includes(x.l.id));
    out.push({ task, points: pick.map(({ l, index }) => ({ ...(l.id ? { id: l.id } : {}), index, text: stripMarks(l.text), done: l.done })) });
  }
  return out;
}

/** Progress of a block: its own checklist lines plus the linked points (a linked todo without points counts as one item). */
export function blockProgress(notes: string, views: EntryView[]): { done: number; total: number } {
  let done = 0, total = 0;
  for (const l of parseNotes(notes)) if (l.check) { total++; if (l.done) done++; }
  for (const v of views) {
    if (v.points.length) { total += v.points.length; done += v.points.filter((p) => p.done).length; }
    else { total++; if (v.task.done) done++; }
  }
  return { done, total };
}

/** Open work left in an entry (an open todo; with a point subset only its unfinished points). Null when nothing is left. */
function openRest(e: PlanEntry, task: TaskRef | undefined): PlanEntry | null {
  if (!task || task.trashedAt !== null || task.done) return null;
  if (e.points === null) return e;
  const open = new Set(parseNotes(task.notes).filter((l) => l.check && !l.done && l.id).map((l) => l.id!));
  const rest = e.points.filter((p) => open.has(p));
  return e.points.length && !rest.length ? null : { ...e, points: rest };
}

export interface CarryPlan { create: Omit<Block, "id">[]; update: { id: string; entries: PlanEntry[] }[] }

/**
 * Open work of one day for the next: per block of `from` that has linked todos, the entries that are still open go to the block
 * with the same title on `to` (created with the same times when missing). Entries already there are not repeated.
 */
export function carryOver(from: Block[], to: Block[], toDate: string, tasks: Map<string, TaskRef>): CarryPlan {
  const plan: CarryPlan = { create: [], update: [] };
  const target = new Map(to.map((b) => [b.title.trim().toLowerCase(), b]));
  for (const b of from) {
    const rest = b.entries.map((e) => openRest(e, tasks.get(e.taskId))).filter((e): e is PlanEntry => !!e);
    if (!rest.length) continue;
    const key = b.title.trim().toLowerCase();
    const t = target.get(key);
    if (!t) {
      plan.create.push({ title: b.title, notes: "", date: toDate, start: b.start, end: b.end, entries: rest });
      continue;
    }
    const have = new Set(t.entries.map((e) => e.taskId));
    const add = rest.filter((e) => !have.has(e.taskId));
    if (add.length) plan.update.push({ id: t.id, entries: [...t.entries, ...add] });
  }
  return plan;
}
