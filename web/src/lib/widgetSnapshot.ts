import { addDays, fmtLong, todayStr } from "./dates";
import { type Lang, translate } from "./i18n";
import { type TaskItem, compareTasks, doneDay, extras, groupOf, isDone, isOpen } from "./taskLogic";

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
  labels: { today: string; none: string; todo: string; done: string; empty: string; emptyDone: string };
  todo: WRow[];
  done: WRow[];
}

const MAX_ROWS = 80;
const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** Pure: everything the native widget needs, already formatted. */
export function buildSnapshot(tasks: TaskItem[], lang: Lang, now = new Date(), tracker: TrackerState = null): WidgetSnapshot {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const today = todayStr(now);

  const todo: WRow[] = [];
  let lastGroup = "";
  for (const x of tasks.filter(isOpen).sort(compareTasks)) {
    const g = groupOf(x, today);
    if (g !== lastGroup) {
      todo.push({ k: "h", title: t(g) });
      lastGroup = g;
    }
    const meta = !x.dueDate ? "" : x.dueDate === today ? x.dueTime ?? "" : `${x.dueDate === addDays(today, 1) ? t("tomorrow") : fmtLong(x.dueDate, lang)}${x.dueTime ? ` ${x.dueTime}` : ""}`;
    todo.push({ k: "t", id: x.id, title: x.title, meta, prio: x.priority, rep: !!x.repeat, ...flags(x, tracker) });
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

  return {
    lang,
    labels: { today: t("today"), none: t("noDate"), todo: t("todoTab"), done: t("haveDone"), empty: t("noOpen"), emptyDone: t("noneDone") },
    todo: todo.slice(0, MAX_ROWS),
    done: done.slice(0, MAX_ROWS),
  };
}

