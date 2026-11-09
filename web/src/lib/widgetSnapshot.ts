import { addDays, fmtLong, todayStr } from "./dates";
import { occurrences } from "./repeat";
import { type Lang, translate } from "./i18n";
import { noteStats } from "./notes";
import { type Block, blockProgress, byStart, resolveEntries } from "./planLogic";
import { type TaskItem, doneDay, extras, groupOpen, isDone, sortOpen } from "./taskLogic";

/** One rendered row of the home screen widget: a day/section header or a task. */
export interface WRow {
  k: "h" | "t";
  id?: string;
  title: string;
  meta?: string;
  prio?: number;
  /** repeating: the app must apply the completion (rolls the deadline forward) */
  rep?: boolean;
  /** has plain note text / has checklist items */
  n?: boolean;
  c?: boolean;
  /** tracker: 0 not set up, 1 can be sent, 2 already sent */
  s?: number;
}

/** Tracker setup state of this device: null = not connected, else the ids that were already sent. */
export type TrackerState = { sent: Set<string> } | null;

const flags = (x: TaskItem, tr: TrackerState): Pick<WRow, "n" | "c" | "s"> => {
  const e = extras(x);
  return { n: !!e.note, c: e.total > 0, s: tr ? (tr.sent.has(x.id) ? 2 : 1) : 0 };
};

export interface WidgetSnapshot {
  lang: Lang;
  labels: { today: string; none: string; noPrio: string; todo: string; done: string; calendar: string; plan: string; empty: string; emptyDone: string; emptyEvents: string; emptyPlan: string };
  todo: WRow[];
  done: WRow[];
  /** upcoming appointments (next one first), grouped by day, up to two years ahead */
  events: WRow[];
  /** plan blocks of today and tomorrow in time order, with day headers */
  plan: WRow[];
}

const MAX_ROWS = 80;
const EVENT_ROWS = 150;
const EVENT_DAYS = 730;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** Pure: everything the native widget needs, already formatted. */
export function buildSnapshot(tasks: TaskItem[], lang: Lang, now = new Date(), tracker: TrackerState = null, hour = 9, blocks: Block[] = []): WidgetSnapshot {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const today = todayStr(now);

  const todo: WRow[] = [];
  for (const g of groupOpen(sortOpen(tasks, now.getTime(), hour), now.getTime(), hour)) {
    todo.push({ k: "h", title: g.key === "urgent" ? t("dueSoon") : g.key === 3 ? t("pHigh") : g.key === 2 ? t("pMed") : g.key === 1 ? t("pLow") : t("pNone") });
    for (const x of g.tasks) {
    const meta = !x.dueDate ? "" : x.dueDate === today ? x.dueTime ?? "" : `${x.dueDate === addDays(today, 1) ? t("tomorrow") : fmtLong(x.dueDate, lang)}${x.dueTime ? ` ${x.dueTime}` : ""}`;
    todo.push({ k: "t", id: x.id, title: x.title, meta: x.priority ? `${"!".repeat(x.priority)} ${meta}`.trim() : meta, prio: x.priority, rep: !!x.repeat, ...flags(x, tracker) });
    }
  }

  const done: WRow[] = [];
  const byDay = new Map<string, TaskItem[]>();
  for (const x of tasks.filter(isDone)) byDay.set(doneDay(x), [...(byDay.get(doneDay(x)) ?? []), x]);
  for (const [day, items] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    done.push({ k: "h", title: day === today ? t("today") : day === addDays(today, -1) ? t("yesterday") : fmtLong(day, lang) });
    for (const x of items.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))) {
      done.push({ k: "t", id: x.id, title: x.title, meta: clock(x.completedAt ?? x.updatedAt), prio: x.priority, ...flags(x, tracker) });
    }
  }

  // appointments: open tasks with a lead time; a repeating one counts with its next occurrence
  const until = addDays(today, EVENT_DAYS);
  const upcoming: { day: string; x: TaskItem }[] = [];
  for (const x of tasks) {
    if (!x.dueDate || x.showBeforeMin === null || x.done || x.trashedAt !== null) continue;
    const day = x.repeat ? occurrences(x.dueDate, x.repeat, today, until)[0] : x.dueDate >= today && x.dueDate <= until ? x.dueDate : undefined;
    if (day) upcoming.push({ day, x });
  }
  upcoming.sort((a, b) => (a.day + (a.x.dueTime ?? "")).localeCompare(b.day + (b.x.dueTime ?? "")));
  const events: WRow[] = [];
  let last = "";
  for (const { day, x } of upcoming) {
    if (day !== last) { last = day; events.push({ k: "h", title: day === today ? t("today") : day === addDays(today, 1) ? t("tomorrow") : fmtLong(day, lang) }); }
    events.push({ k: "t", id: x.id, title: x.title, meta: x.dueTime ?? "", prio: x.priority, ...flags(x, null) });
  }

  const plan: WRow[] = [];
  const refs = new Map(tasks.map((x) => [x.id, { id: x.id, title: x.title, notes: x.notes, done: x.done, trashedAt: x.trashedAt }]));
  const tomorrow = addDays(today, 1);
  for (const day of [today, tomorrow]) {
    const rows = blocks.filter((b) => b.date === day).sort(byStart);
    if (!rows.length) continue;
    plan.push({ k: "h", title: day === today ? t("today") : t("tomorrow") });
    for (const b of rows) {
      const st = noteStats(b.notes);
      const pr = blockProgress(b.notes, resolveEntries(b.entries ?? [], refs));
      plan.push({ k: "t", id: b.id, title: b.title, meta: `${b.start}–${b.end}${pr.total ? `   ${pr.done}/${pr.total}` : ""}`, n: !!st.first, c: pr.total > 0 });
    }
  }

  return {
    lang,
    labels: { today: t("today"), none: t("noDate"), noPrio: t("pNone"), todo: t("todoTab"), done: t("haveDone"), calendar: t("calendar"), plan: t("plan"), empty: t("noOpen"), emptyDone: t("noneDone"), emptyEvents: t("noEvents"), emptyPlan: t("planEmptyToday") },
    todo: todo.slice(0, MAX_ROWS),
    done: done.slice(0, MAX_ROWS),
    events: events.slice(0, EVENT_ROWS),
    plan: plan.slice(0, MAX_ROWS),
  };
}

