import { habitLogId } from "@dayloop/shared";
import { local } from "./app";
import type { Tools } from "./assistant";
import { matchByName } from "./assistant";
import { todayStr } from "./dates";
import { habitCounts } from "./habits";
import { pomo } from "./pomoStore";
import { addTask, isDone, isOpen, sortOpen, toggleDone, trashTask } from "./tasks";

const str = { type: "string" } as const;
const date = { type: "string", description: "YYYY-MM-DD" } as const;
const time = { type: "string", description: "HH:mm" } as const;
const prio = { type: "integer", minimum: 0, maximum: 3 } as const;
const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required });

const asDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const asTime = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);
const brief = (t: { id: string; title: string; dueDate: string | null; dueTime: string | null; priority: number; done: boolean }) =>
  ({ title: t.title, due: t.dueDate ? `${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ""}` : null, priority: t.priority, done: t.done });

async function findTask(query: unknown, pool: "open" | "any" = "open") {
  const all = (await local.all("task")).filter((t) => t.trashedAt === null && (pool === "any" || isOpen(t)));
  const m = matchByName(String(query ?? ""), all, (t) => t.title);
  if (m.hit) return m.hit;
  if (m.candidates.length) throw new Error(`ambiguous: ${m.candidates.slice(0, 5).map((t) => t.title).join(" | ")}`);
  throw new Error("not_found");
}

/** Everything the assistant may do, on the local data (syncs like any other change). */
export const appTools: Tools = {
  defs: [
    { name: "add_task", description: "Create a todo or calendar entry (a deadline shows in the calendar).", parameters: obj({ title: str, dueDate: date, dueTime: time, priority: prio, notes: str, repeat: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] } }, ["title"]) },
    { name: "list_tasks", description: "List tasks. scope: open (default, in app order), today, overdue, done_today.", parameters: obj({ scope: { type: "string", enum: ["open", "today", "overdue", "done_today"] }, limit: { type: "integer" } }) },
    { name: "complete_task", description: "Mark an open task as done, found by (part of) its title.", parameters: obj({ query: str }, ["query"]) },
    { name: "update_task", description: "Change an open task: new title, deadline (empty string clears it), time, priority, or add a note line.", parameters: obj({ query: str, title: str, dueDate: { type: "string", description: "YYYY-MM-DD or empty to clear" }, dueTime: time, priority: prio, addNote: str }, ["query"]) },
    { name: "delete_task", description: "Move a task to the trash.", parameters: obj({ query: str }, ["query"]) },
    { name: "add_done", description: "Record something already finished (Have Done).", parameters: obj({ title: str }, ["title"]) },
    { name: "list_habits", description: "Habits with today's progress.", parameters: obj({}) },
    { name: "log_habit", description: "Log a habit as done today (or add count for countable habits).", parameters: obj({ name: str, count: { type: "integer", description: "how many to add, default 1" } }, ["name"]) },
    { name: "start_timer", description: "Start the focus timer, optionally with a length in minutes and a task to link.", parameters: obj({ minutes: { type: "integer" }, task: str }) },
    { name: "stop_timer", description: "Pause the running focus timer.", parameters: obj({}) },
  ],

  async run(name, a) {
    const now = new Date();
    const today = todayStr(now);
    switch (name) {
      case "add_task": {
        const dueDate = asDate(a.dueDate);
        const id = await addTask({
          title: String(a.title ?? "").trim() || "?", notes: typeof a.notes === "string" ? a.notes : "",
          dueDate, dueTime: dueDate ? asTime(a.dueTime) : null, priority: Math.max(0, Math.min(3, Number(a.priority) || 0)),
          repeat: dueDate && typeof a.repeat === "string" ? { freq: a.repeat as "daily", interval: 1 } : null,
          reminders: dueDate && asTime(a.dueTime) ? [{ offsetMin: 0 }] : [],
        });
        return { ok: true, id };
      }
      case "list_tasks": {
        const hour = (await local.all("settings"))[0]?.defaultReminderHour ?? 9;
        const tasks = await local.all("task");
        const scope = String(a.scope ?? "open");
        const open = sortOpen(tasks, now.getTime(), hour);
        const pick = scope === "today" ? open.filter((t) => t.dueDate === today)
          : scope === "overdue" ? open.filter((t) => t.dueDate && t.dueDate < today)
          : scope === "done_today" ? tasks.filter((t) => isDone(t) && new Date(t.completedAt ?? t.updatedAt).toDateString() === now.toDateString())
          : open;
        return pick.slice(0, Math.min(Number(a.limit) || 15, 30)).map(brief);
      }
      case "complete_task": {
        const t = await findTask(a.query);
        await toggleDone(t, today);
        return { ok: true, title: t.title };
      }
      case "update_task": {
        const t = await findTask(a.query);
        const patch: Record<string, unknown> = {};
        if (typeof a.title === "string" && a.title.trim()) patch.title = a.title.trim();
        if (a.dueDate === "") { patch.dueDate = null; patch.dueTime = null; }
        else if (asDate(a.dueDate)) patch.dueDate = a.dueDate;
        if (asTime(a.dueTime)) patch.dueTime = a.dueTime;
        if (a.priority !== undefined) patch.priority = Math.max(0, Math.min(3, Number(a.priority) || 0));
        if (typeof a.addNote === "string" && a.addNote.trim()) patch.notes = t.notes ? `${t.notes}\n${a.addNote.trim()}` : a.addNote.trim();
        await local.patch("task", t.id, patch);
        return { ok: true, title: t.title };
      }
      case "delete_task": {
        const t = await findTask(a.query, "any");
        await trashTask(t.id);
        return { ok: true, title: t.title };
      }
      case "add_done":
        return { ok: true, id: await addTask({ title: String(a.title ?? "").trim() || "?", done: true, completedAt: Date.now() }) };
      case "list_habits": {
        const counts = habitCounts(await local.all("habitlog"));
        return (await local.all("habit")).filter((h) => !h.archived).map((h) => ({ name: h.name, today: counts.get(h.id)?.get(today) ?? 0, target: h.target }));
      }
      case "log_habit": {
        const habits = (await local.all("habit")).filter((h) => !h.archived);
        const m = matchByName(String(a.name ?? ""), habits, (h) => h.name);
        if (!m.hit) throw new Error(m.candidates.length ? `ambiguous: ${m.candidates.map((h) => h.name).join(" | ")}` : "not_found");
        const cur = habitCounts(await local.all("habitlog")).get(m.hit.id)?.get(today) ?? 0;
        const count = Math.min(cur + Math.max(1, Number(a.count) || 1), Math.max(m.hit.target, cur));
        await local.put("habitlog", habitLogId(m.hit.id, today), { habitId: m.hit.id, date: today, count });
        return { ok: true, name: m.hit.name, today: count, target: m.hit.target };
      }
      case "start_timer": {
        let taskId: string | null = null;
        if (a.task) taskId = (await findTask(a.task)).id;
        const min = Number(a.minutes) || 0;
        if (min > 0) pomo.setCustom(min);
        if (taskId) pomo.setTask(taskId);
        pomo.start();
        return { ok: true, minutes: min || undefined };
      }
      case "stop_timer":
        pomo.pause();
        return { ok: true };
      default:
        throw new Error("unknown_tool");
    }
  },
};
