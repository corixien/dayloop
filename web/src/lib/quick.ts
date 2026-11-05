import { parseQuick } from "./nlp";
import { todayStr } from "./dates";
import { addDoneEntry, addTask } from "./tasks";

export type QuickKind = "todo" | "done" | "event";

export async function quickCreate(text: string, kind: QuickKind): Promise<string | null> {
  const p = parseQuick(text);
  if (!p.title) return null;
  const notes = [p.notes, ...p.items.map((i) => `- [ ] ${i}`)].filter(Boolean).join("\n");
  if (kind === "done") { await addDoneEntry(p.title, notes); return p.title; }
  const dueDate = p.dueDate ?? (kind === "event" ? todayStr() : null);
  await addTask({
    title: p.title, notes, dueDate, dueTime: dueDate ? p.dueTime : null, priority: p.priority, repeat: p.repeat,
    reminders: dueDate && p.dueTime ? [{ offsetMin: 0 }] : [],
    ...(kind === "event" ? { showBeforeMin: 1440 } : {}),
  });
  return p.title;
}
