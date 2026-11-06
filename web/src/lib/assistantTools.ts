import { habitLogId } from "@dayloop/shared";
import { local, uid } from "./app";
import { type Tools, matchByName } from "./assistant";
import { addDays, todayStr, weekday } from "./dates";
import { habitCounts } from "./habits";
import { deleteText, saveText, searchPodcasts, subscribe, unsubscribe } from "./motivation";
import { formatNotes, parseNotes, stripMarks, toggled } from "./notes";
import { pomo } from "./pomoStore";
import { type TaskItem, addTask, doneDay, isDone, isOpen, sortOpen, toggleDone, trashTask } from "./tasks";
import { getTracker, markSent, sendToTracker } from "./tracker";

const str = { type: "string" } as const;
const date = { type: "string", description: "YYYY-MM-DD" } as const;
const time = { type: "string", description: "HH:mm" } as const;
const prio = { type: "integer", minimum: 0, maximum: 3, description: "0 none, 1 low, 2 medium, 3 high" } as const;
const repeat = { type: "string", enum: ["none", "daily", "weekly", "monthly", "yearly"] } as const;
const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });

const COLOR_NAMES = ["gray", "red", "orange", "amber", "green", "teal", "blue", "indigo", "purple", "pink"];
const asColor = (v: unknown) => (typeof v === "string" && COLOR_NAMES.includes(v) ? v : undefined);
const asDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const asTime = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v) ? v.padStart(5, "0") : null);
const clampPrio = (v: unknown) => Math.max(0, Math.min(3, Math.round(Number(v)) || 0));
const brief = (t: TaskItem) => ({ title: t.title, due: t.dueDate ? `${t.dueDate}${t.dueTime ? ` ${t.dueTime}` : ""}` : null, priority: t.priority, repeat: t.repeat?.freq ?? null, done: t.done });

type Pool = "open" | "done" | "trash" | "any";
async function findTask(query: unknown, pool: Pool = "open"): Promise<TaskItem> {
  const all = (await local.all("task")).filter((t) =>
    pool === "trash" ? t.trashedAt !== null : t.trashedAt === null && (pool === "any" || (pool === "open" ? isOpen(t) : isDone(t))));
  const m = matchByName(String(query ?? ""), all, (t) => t.title);
  if (m.hit) return m.hit;
  if (m.candidates.length) throw new Error(`ambiguous: ${m.candidates.slice(0, 5).map((t) => t.title).join(" | ")} (nothing changed; ask the user which one)`);
  throw new Error("not_found");
}

async function findHabit(name: unknown) {
  const habits = (await local.all("habit")).filter((h) => !h.archived);
  const m = matchByName(String(name ?? ""), habits, (h) => h.name);
  if (m.hit) return m.hit;
  throw new Error(m.candidates.length ? `ambiguous: ${m.candidates.map((h) => h.name).join(" | ")}` : "not_found");
}

async function findText(query: unknown) {
  const m = matchByName(String(query ?? ""), await local.all("motext"), (x) => x.title);
  if (m.hit) return m.hit;
  throw new Error(m.candidates.length ? `ambiguous: ${m.candidates.map((x) => x.title).join(" | ")}` : "not_found");
}

const reminders = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map((n) => Math.max(0, Math.round(Number(n)) || 0)))].slice(0, 6).map((offsetMin) => ({ offsetMin })) : null);
const repeatOf = (freq: unknown, interval: unknown) =>
  typeof freq === "string" && freq !== "none" && ["daily", "weekly", "monthly", "yearly"].includes(freq) ? { freq: freq as "daily", interval: Math.max(1, Math.round(Number(interval)) || 1) } : null;

/**
 * Everything the assistant may do: the same things the user can do in the app (tasks, calendar, notes/checklists,
 * habits, focus timer, motivation), except settings. Works on the local data, so it syncs like any other change.
 */
export const appTools: Tools = {
  async context() {
    const open = sortOpen(await local.all("task"), Date.now(), 9).slice(0, 40).map((t) => {
      const steps = parseNotes(t.notes).filter((l) => l.check && !l.done).map((l) => `[ ] ${l.text}`);
      return `- ${t.title}${t.dueDate ? ` (${t.dueDate})` : ""}${steps.length ? `: ${steps.join("; ")}` : ""}`;
    });
    const habits = (await local.all("habit")).filter((h) => !h.archived).slice(0, 20).map((h) => h.name);
    return `Offene Aufgaben / open tasks:\n${open.join("\n") || "-"}\nHabits: ${habits.join(", ") || "-"}`;
  },
  defs: [
    { name: "add_task", description: "Create a todo / calendar entry. A deadline (dueDate, optional dueTime) shows up in the calendar. reminders = minutes before the deadline (24 h before is automatic).", parameters: obj({ title: str, dueDate: date, dueTime: time, priority: prio, notes: str, checklist: { type: "array", items: str, description: "subtasks / steps of this task, one entry each" }, repeat, interval: { type: "integer" }, reminders: { type: "array", items: { type: "integer" } } }, ["title"]) },
    { name: "list_tasks", description: "List tasks. scope: open (default, in app order), today, tomorrow, overdue, week (next 7 days), done_today, done_all. Optional text filter.", parameters: obj({ scope: { type: "string", enum: ["open", "today", "tomorrow", "overdue", "week", "done_today", "done_all"] }, contains: str, limit: { type: "integer" } }) },
    { name: "get_task", description: "All details of one task including notes and checklist.", parameters: obj({ query: str }, ["query"]) },
    { name: "update_task", description: "Change a task (open or done): title, deadline (empty dueDate clears it), time, priority, repeat (none removes), reminders (replace), notes (replace) or addNote (append a line).", parameters: obj({ query: str, title: str, dueDate: { type: "string", description: "YYYY-MM-DD, empty string clears" }, dueTime: { type: "string", description: "HH:mm, empty string clears" }, priority: prio, repeat, interval: { type: "integer" }, reminders: { type: "array", items: { type: "integer" } }, notes: str, addNote: str }, ["query"]) },
    { name: "complete_task", description: "Mark an open task as done (repeating tasks roll forward).", parameters: obj({ query: str }, ["query"]) },
    { name: "reopen_task", description: "Move a finished task back to the todo list.", parameters: obj({ query: str }, ["query"]) },
    { name: "delete_task", description: "Move a task to the trash.", parameters: obj({ query: str }, ["query"]) },
    { name: "restore_task", description: "Bring a task back from the trash.", parameters: obj({ query: str }, ["query"]) },
    { name: "add_done", description: "Record something that is ALREADY finished (past tense, e.g. \"I walked the dog\") directly in Have Done. Not for open tasks.", parameters: obj({ title: str, notes: str }, ["title"]) },
    { name: "add_checklist_item", description: "Add checklist lines (subtasks) to a task's notes. Pass all steps at once in items.", parameters: obj({ query: str, items: { type: "array", items: str }, text: str }, ["query"]) },
    { name: "tick_checklist_item", description: "Tick (or untick with done=false) a checklist line of a task, found by part of its text.", parameters: obj({ query: str, item: str, done: { type: "boolean" } }, ["query", "item"]) },
    { name: "list_done", description: "What was finished on a day (default today), as in Have Done.", parameters: obj({ date }) },
    { name: "list_calendar", description: "Calendar between two dates (inclusive): deadlines, finished tasks and habits done.", parameters: obj({ from: date, to: date }, ["from", "to"]) },
    { name: "send_to_tracker", description: "Send a finished task to the Productivity-Tracker (only if the user connected it).", parameters: obj({ query: str }, ["query"]) },

    { name: "list_habits", description: "Habits with today's progress and weekdays.", parameters: obj({}) },
    { name: "log_habit", description: "Mark a habit as done for a day (default today); count = how many to add for countable habits.", parameters: obj({ name: str, date, count: { type: "integer" } }, ["name"]) },
    { name: "unlog_habit", description: "Remove a habit's completion for a day (default today).", parameters: obj({ name: str, date }, ["name"]) },
    { name: "create_habit", description: "Create a habit. days = weekdays 0-6 (0 = Sunday), default every day. color one of gray, red, orange, amber, green, teal, blue, indigo, purple, pink.", parameters: obj({ name: str, target: { type: "integer" }, unit: str, days: { type: "array", items: { type: "integer" } }, color: str, reminderTime: time }, ["name"]) },
    { name: "update_habit", description: "Change a habit.", parameters: obj({ name: str, newName: str, target: { type: "integer" }, unit: str, days: { type: "array", items: { type: "integer" } }, color: str, reminderTime: { type: "string", description: "HH:mm, empty clears" } }, ["name"]) },
    { name: "delete_habit", description: "Delete a habit.", parameters: obj({ name: str }, ["name"]) },

    { name: "start_timer", description: "Start the focus timer. phase: focus (default), break, long. minutes: custom focus length. task: link a task.", parameters: obj({ phase: { type: "string", enum: ["focus", "break", "long"] }, minutes: { type: "integer" }, task: str }) },
    { name: "pause_timer", description: "Pause the running timer.", parameters: obj({}) },
    { name: "resume_timer", description: "Continue a paused timer.", parameters: obj({}) },
    { name: "reset_timer", description: "Reset the timer to the start of the current phase.", parameters: obj({}) },
    { name: "skip_timer", description: "End the current phase and move to the next one.", parameters: obj({}) },
    { name: "timer_status", description: "Current phase, state and remaining time.", parameters: obj({}) },

    { name: "list_motivation_texts", description: "The user's own motivation texts (titles).", parameters: obj({}) },
    { name: "get_motivation_text", description: "Read one motivation text.", parameters: obj({ query: str }, ["query"]) },
    { name: "add_motivation_text", description: "Write a new motivation text for the user.", parameters: obj({ title: str, body: str }, ["title", "body"]) },
    { name: "update_motivation_text", description: "Change a motivation text: new title, replace body, or append text.", parameters: obj({ query: str, title: str, body: str, append: str }, ["query"]) },
    { name: "delete_motivation_text", description: "Delete a motivation text.", parameters: obj({ query: str }, ["query"]) },
    { name: "list_podcasts", description: "Subscribed podcasts.", parameters: obj({}) },
    { name: "search_podcasts", description: "Search podcasts by name or topic.", parameters: obj({ term: str }, ["term"]) },
    { name: "add_podcast", description: "Subscribe to the best match of a podcast search.", parameters: obj({ term: str }, ["term"]) },
    { name: "remove_podcast", description: "Unsubscribe from a podcast by title.", parameters: obj({ title: str }, ["title"]) },
  ],

  async run(name, a) {
    const now = new Date();
    const today = todayStr(now);
    const lang = (await local.all("settings"))[0]?.language ?? "de";
    switch (name) {
      case "add_task": {
        const dueDate = asDate(a.dueDate) ?? (repeatOf(a.repeat, a.interval) ? todayStr() : null);
        const dueTime = dueDate ? asTime(a.dueTime) : null;
        const id = await addTask({
          title: String(a.title ?? "").trim() || "?",
          notes: [typeof a.notes === "string" ? a.notes.trim() : "", ...(Array.isArray(a.checklist) ? a.checklist : []).map((x) => String(x).trim()).filter(Boolean).map((x) => `- [ ] ${x}`)].filter(Boolean).join("\n"),
          dueDate, dueTime, priority: clampPrio(a.priority),
          repeat: dueDate ? repeatOf(a.repeat, a.interval) : null,
          reminders: dueDate ? reminders(a.reminders) ?? (dueTime ? [{ offsetMin: 0 }] : []) : [],
        });
        return { ok: true, id };
      }
      case "list_tasks": {
        const hour = (await local.all("settings"))[0]?.defaultReminderHour ?? 9;
        const tasks = await local.all("task");
        const open = sortOpen(tasks, now.getTime(), hour);
        const scope = String(a.scope ?? "open");
        const tomorrow = addDays(today, 1), week = addDays(today, 7);
        let pick: TaskItem[] =
          scope === "today" ? open.filter((t) => t.dueDate === today)
          : scope === "tomorrow" ? open.filter((t) => t.dueDate === tomorrow)
          : scope === "overdue" ? open.filter((t) => t.dueDate && t.dueDate < today)
          : scope === "week" ? open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= week)
          : scope === "done_today" ? tasks.filter((t) => isDone(t) && doneDay(t) === today)
          : scope === "done_all" ? tasks.filter(isDone).sort((x, y) => (y.completedAt ?? 0) - (x.completedAt ?? 0))
          : open;
        if (typeof a.contains === "string" && a.contains.trim()) pick = pick.filter((t) => t.title.toLowerCase().includes(String(a.contains).toLowerCase()));
        return pick.slice(0, Math.min(Number(a.limit) || 20, 40)).map(brief);
      }
      case "get_task": {
        const t = await findTask(a.query, "any");
        return { ...brief(t), notes: t.notes, reminders: t.reminders.map((r) => r.offsetMin) };
      }
      case "update_task": {
        const t = await findTask(a.query, "any");
        const patch: Record<string, unknown> = {};
        if (typeof a.title === "string" && a.title.trim()) patch.title = a.title.trim();
        if (a.dueDate === "") { patch.dueDate = null; patch.dueTime = null; patch.repeat = null; }
        else if (asDate(a.dueDate)) patch.dueDate = a.dueDate;
        if (a.dueTime === "") patch.dueTime = null;
        else if (asTime(a.dueTime)) patch.dueTime = asTime(a.dueTime);
        if (a.priority !== undefined) patch.priority = clampPrio(a.priority);
        if (a.repeat !== undefined) patch.repeat = repeatOf(a.repeat, a.interval);
        if (a.reminders !== undefined) patch.reminders = reminders(a.reminders) ?? [];
        if (typeof a.notes === "string") patch.notes = a.notes;
        if (typeof a.addNote === "string" && a.addNote.trim()) patch.notes = `${typeof a.notes === "string" ? a.notes : t.notes}${(typeof a.notes === "string" ? a.notes : t.notes) ? "\n" : ""}${a.addNote.trim()}`;
        await local.patch("task", t.id, patch);
        return { ok: true, title: t.title };
      }
      case "complete_task": { const t = await findTask(a.query); await toggleDone(t, today); return { ok: true, title: t.title }; }
      case "reopen_task": { const t = await findTask(a.query, "done"); await toggleDone(t, today); return { ok: true, title: t.title }; }
      case "delete_task": { const t = await findTask(a.query, "any"); await trashTask(t.id); return { ok: true, title: t.title }; }
      case "restore_task": { const t = await findTask(a.query, "trash"); await local.patch("task", t.id, { trashedAt: null }); return { ok: true, title: t.title }; }
      case "add_done":
        return { ok: true, id: await addTask({ title: String(a.title ?? "").trim() || "?",
          notes: [typeof a.notes === "string" ? a.notes.trim() : "", ...(Array.isArray(a.checklist) ? a.checklist : []).map((x) => String(x).trim()).filter(Boolean).map((x) => `- [ ] ${x}`)].filter(Boolean).join("\n"), done: true, completedAt: Date.now() }) };
      case "add_checklist_item": {
        const t = await findTask(a.query, "any");
        const items = [...(Array.isArray(a.items) ? a.items : []), ...(a.text ? [a.text] : [])].map((x) => String(x).trim()).filter(Boolean);
        if (!items.length) throw new Error("no_items");
        await local.patch("task", t.id, { notes: `${t.notes}${t.notes ? "\n" : ""}${items.map((x) => `- [ ] ${x}`).join("\n")}` });
        return { ok: true, title: t.title, added: items.length };
      }
      case "tick_checklist_item": {
        const t = await findTask(a.query, "any");
        const lines = parseNotes(t.notes);
        const items = lines.map((l, i) => ({ id: String(i), l })).filter((x) => x.l.check);
        const m = matchByName(String(a.item ?? ""), items, (x) => stripMarks(x.l.text));
        if (!m.hit) throw new Error(m.candidates.length ? `ambiguous: ${m.candidates.map((x) => x.l.text).join(" | ")}` : "not_found");
        const want = a.done !== false;
        const i = Number(m.hit.id);
        if (lines[i].done !== want) lines[i] = toggled(lines[i]);
        await local.patch("task", t.id, { notes: formatNotes(lines) });
        return { ok: true, item: m.hit.l.text, done: want };
      }
      case "list_done": {
        const d = asDate(a.date) ?? today;
        return (await local.all("task")).filter((t) => isDone(t) && doneDay(t) === d).map((t) => ({ title: t.title, at: new Date(t.completedAt ?? t.updatedAt).toTimeString().slice(0, 5) }));
      }
      case "list_calendar": {
        const from = asDate(a.from) ?? today, to = asDate(a.to) ?? from;
        const tasks = (await local.all("task")).filter((t) => t.trashedAt === null);
        const counts = habitCounts(await local.all("habitlog"));
        const habits = (await local.all("habit")).filter((h) => !h.archived);
        const out: Record<string, unknown[]> = {};
        const add = (d: string, v: unknown) => { if (d >= from && d <= to) (out[d] ??= []).push(v); };
        for (const t of tasks) {
          if (!t.done && t.dueDate) add(t.dueDate, { todo: t.title, time: t.dueTime });
          if (t.done) add(doneDay(t), { done: t.title });
        }
        for (const h of habits) for (const [d, n] of counts.get(h.id) ?? []) if (n >= h.target) add(d, { habit: h.name });
        return out;
      }
      case "send_to_tracker": {
        const cfg = getTracker();
        if (!cfg) throw new Error("tracker_not_connected");
        const t = await findTask(a.query, "done");
        const r = await sendToTracker(cfg, [{ title: t.title, notes: t.notes }], lang as "de");
        markSent([t.id]);
        return { ok: true, name: r.name, xp: r.xp };
      }

      case "list_habits": {
        const counts = habitCounts(await local.all("habitlog"));
        return (await local.all("habit")).filter((h) => !h.archived).map((h) => ({ name: h.name, today: counts.get(h.id)?.get(today) ?? 0, target: h.target, unit: h.unit, days: h.days, activeToday: h.days.includes(weekday(today)) }));
      }
      case "log_habit": {
        const h = await findHabit(a.name);
        const d = asDate(a.date) ?? today;
        const cur = habitCounts(await local.all("habitlog")).get(h.id)?.get(d) ?? 0;
        const count = Math.min(cur + Math.max(1, Math.round(Number(a.count)) || 1), Math.max(h.target, cur));
        await local.put("habitlog", habitLogId(h.id, d), { habitId: h.id, date: d, count });
        return { ok: true, name: h.name, date: d, count, target: h.target };
      }
      case "unlog_habit": {
        const h = await findHabit(a.name);
        const d = asDate(a.date) ?? today;
        await local.put("habitlog", habitLogId(h.id, d), { habitId: h.id, date: d, count: 0 });
        return { ok: true, name: h.name, date: d };
      }
      case "create_habit": {
        const days = Array.isArray(a.days) ? [...new Set(a.days.map(Number).filter((n) => n >= 0 && n <= 6))] : [0, 1, 2, 3, 4, 5, 6];
        const id = uid();
        await local.put("habit", id, {
          name: String(a.name ?? "").trim() || "?", color: asColor(a.color) ?? "green", target: Math.max(1, Math.round(Number(a.target)) || 1),
          unit: typeof a.unit === "string" ? a.unit : "", days: days.length ? days : [0, 1, 2, 3, 4, 5, 6], startDate: today, order: Date.now(),
          reminderTime: asTime(a.reminderTime),
        });
        return { ok: true, id };
      }
      case "update_habit": {
        const h = await findHabit(a.name);
        const patch: Record<string, unknown> = {};
        if (typeof a.newName === "string" && a.newName.trim()) patch.name = a.newName.trim();
        if (a.target !== undefined) patch.target = Math.max(1, Math.round(Number(a.target)) || 1);
        if (typeof a.unit === "string") patch.unit = a.unit;
        if (asColor(a.color)) patch.color = asColor(a.color);
        if (Array.isArray(a.days)) { const d = [...new Set(a.days.map(Number).filter((n) => n >= 0 && n <= 6))]; if (d.length) patch.days = d; }
        if (a.reminderTime === "") patch.reminderTime = null; else if (asTime(a.reminderTime)) patch.reminderTime = asTime(a.reminderTime);
        await local.patch("habit", h.id, patch);
        return { ok: true, name: h.name };
      }
      case "delete_habit": { const h = await findHabit(a.name); await local.remove("habit", h.id); return { ok: true, name: h.name }; }

      case "start_timer": {
        const phase = a.phase === "break" ? "break" : a.phase === "long" ? "long" : "work";
        const task = a.task ? (await findTask(a.task)).id : null;
        const st = pomo.snapshot();
        if (st && st.status !== "idle") pomo.reset();
        const min = Math.round(Number(a.minutes)) || 0;
        if (min > 0 && phase === "work") pomo.setCustom(min); else pomo.setPhase(phase);
        if (task) pomo.setTask(task);
        pomo.start();
        return { ok: true, phase, minutes: min || undefined };
      }
      case "pause_timer": pomo.pause(); return { ok: true };
      case "resume_timer": pomo.start(); return { ok: true };
      case "reset_timer": pomo.reset(); return { ok: true };
      case "skip_timer": pomo.skip(); return { ok: true };
      case "timer_status": {
        const st = pomo.snapshot();
        if (!st) return { status: "unknown" };
        const left = st.status === "running" ? Math.max(0, (st.endsAt ?? 0) - Date.now()) : st.remainingMs;
        return { phase: st.phase, status: st.status, minutesLeft: Math.round(left / 60000), round: st.round };
      }

      case "list_motivation_texts": return (await local.all("motext")).map((x) => ({ title: x.title, preview: x.body.slice(0, 80) }));
      case "get_motivation_text": { const x = await findText(a.query); return { title: x.title, body: x.body }; }
      case "add_motivation_text": {
        await saveText({ title: String(a.title ?? "").trim(), body: String(a.body ?? "") });
        return { ok: true };
      }
      case "update_motivation_text": {
        const x = await findText(a.query);
        const body = typeof a.body === "string" ? a.body : x.body;
        await saveText({ id: x.id, createdAt: x.createdAt, title: typeof a.title === "string" && a.title.trim() ? a.title.trim() : x.title, body: typeof a.append === "string" && a.append ? `${body}\n${a.append}` : body });
        return { ok: true, title: x.title };
      }
      case "delete_motivation_text": { const x = await findText(a.query); await deleteText(x.id); return { ok: true, title: x.title }; }
      case "list_podcasts": return (await local.all("mofeed")).map((f) => ({ title: f.title, author: f.author }));
      case "search_podcasts": return (await searchPodcasts(String(a.term ?? ""), lang)).slice(0, 8).map((f) => ({ title: f.title, author: f.author }));
      case "add_podcast": {
        const f = (await searchPodcasts(String(a.term ?? ""), lang))[0];
        if (!f) throw new Error("not_found");
        await subscribe(f);
        return { ok: true, title: f.title };
      }
      case "remove_podcast": {
        const feeds = await local.all("mofeed");
        const m = matchByName(String(a.title ?? ""), feeds.map((f) => ({ ...f, id: f.url })), (f) => f.title);
        if (!m.hit) throw new Error("not_found");
        await unsubscribe(m.hit.url);
        return { ok: true, title: m.hit.title };
      }
      default:
        throw new Error("unknown_tool");
    }
  },
};
