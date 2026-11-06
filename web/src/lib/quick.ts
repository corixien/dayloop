import { parseQuick } from "./nlp";
import { todayStr } from "./dates";
import { addDoneEntry, addTask } from "./tasks";

export type QuickKind = "todo" | "done" | "event";

/** notes the quick text implies: the part after "//" and the checklist from "Title: a, b, c" */
export const quickNotes = (p: ReturnType<typeof parseQuick>) => [p.notes, ...p.items.map((i) => `- [ ] ${i}`)].filter(Boolean).join("\n");

/** `notes` replaces the implied notes (the detail editor of the search bar passes what the user wrote). */
export async function quickCreate(text: string, kind: QuickKind, notesOverride?: string): Promise<string | null> {
  const p = parseQuick(text);
  if (!p.title) return null;
  const notes = notesOverride ?? quickNotes(p);
  if (kind === "done") { await addDoneEntry(p.title, notes); return p.title; }
  const dueDate = p.dueDate ?? (kind === "event" ? todayStr() : null);
  await addTask({
    title: p.title, notes, dueDate, dueTime: dueDate ? p.dueTime : null, priority: p.priority, repeat: p.repeat,
    reminders: dueDate && p.dueTime ? [{ offsetMin: 0 }] : [],
    ...(kind === "event" ? { showBeforeMin: 1440 } : {}),
  });
  return p.title;
}
