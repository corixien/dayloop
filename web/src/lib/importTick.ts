import type { Repeat } from "@dayloop/shared";

export interface ImportedTask {
  taskId: string;
  title: string;
  notes: string;
  list: string | null;
  folder: string | null;
  tags: string[];
  priority: number;
  dueDate: string | null;
  dueTime: string | null;
  done: boolean;
  completedAt: number | null;
  repeat: Repeat | null;
  reminders: { offsetMin: number }[];
  subtasks: { title: string; done: boolean }[];
}

/** RFC 4180-ish CSV parser (quoted fields, escaped quotes, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

function localParts(iso: string, tz: string): { date: string; time: string } | null {
  const d = new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  if (isNaN(d.getTime())) return null;
  let zone = tz;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); } catch { zone = "UTC"; }
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(d);
  const [date, time] = s.split(" ");
  return { date, time };
}

function parseRule(rule: string): Repeat | null {
  const m = /^RRULE:(.*)$/.exec(rule.trim());
  if (!m) return null;
  const p = Object.fromEntries(m[1].split(";").map((kv) => kv.split("=")));
  const freq = ({ DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" } as Record<string, Repeat["freq"]>)[p.FREQ];
  if (!freq) return null;
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const byWeekday = p.BYDAY ? String(p.BYDAY).split(",").map((d) => days.indexOf(d.replace(/^[+-]?\d+/, ""))).filter((d) => d >= 0) : undefined;
  const until = p.UNTIL ? `${p.UNTIL.slice(0, 4)}-${p.UNTIL.slice(4, 6)}-${p.UNTIL.slice(6, 8)}` : undefined;
  return { freq, interval: Number(p.INTERVAL) || 1, ...(freq === "weekly" && byWeekday?.length ? { byWeekday } : {}), ...(until ? { until } : {}) };
}

function parseTrigger(s: string): number | null {
  const m = /TRIGGER:(-?)P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(s);
  if (!m) return null;
  const min = Number(m[2] ?? 0) * 1440 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return m[1] ? min : 0;
}

/** Parse a TickTick backup CSV export into tasks (checklist rows become subtasks of their parent). */
export function parseTickTickCsv(text: string): ImportedTask[] {
  const rows = parseCsv(text);
  const h = rows.findIndex((r) => r[0] === "Folder Name");
  if (h < 0) throw new Error("not a TickTick export");
  const col = Object.fromEntries(rows[h].map((n, i) => [n, i]));
  const get = (r: string[], n: string) => (col[n] === undefined ? "" : (r[col[n]] ?? ""));
  const out = new Map<string, ImportedTask>();
  const children: { parent: string; title: string; done: boolean }[] = [];

  for (const r of rows.slice(h + 1)) {
    const title = get(r, "Title").trim();
    if (!title) continue;
    const done = get(r, "Status") !== "0";
    const parent = get(r, "parentId");
    if (parent) {
      children.push({ parent, title, done });
      continue;
    }
    const tz = get(r, "Timezone") || "UTC";
    const allDay = get(r, "Is All Day") === "true";
    const due = get(r, "Due Date") || get(r, "Start Date");
    const parts = due ? localParts(due, allDay && get(r, "Is Floating") === "true" ? "UTC" : tz) : null;
    const completed = get(r, "Completed Time");
    const rem = parseTrigger(get(r, "Reminder"));
    out.set(get(r, "taskId") || crypto.randomUUID(), {
      taskId: get(r, "taskId"),
      title,
      notes: get(r, "Content"),
      list: get(r, "List Name") || null,
      folder: get(r, "Folder Name") || null,
      tags: get(r, "Tags").split(",").map((s) => s.trim()).filter(Boolean),
      priority: ({ "0": 0, "1": 1, "3": 2, "5": 3 } as Record<string, number>)[get(r, "Priority")] ?? 0,
      dueDate: parts?.date ?? null,
      dueTime: parts && !allDay ? parts.time : null,
      done,
      completedAt: completed ? new Date(completed.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")).getTime() || null : null,
      repeat: parseRule(get(r, "Repeat")),
      reminders: rem === null || !parts ? [] : [{ offsetMin: rem }],
      subtasks: [],
    });
  }
  for (const c of children) out.get(c.parent)?.subtasks.push({ title: c.title, done: c.done });
  return [...out.values()];
}
