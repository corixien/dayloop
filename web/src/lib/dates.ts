/** Dates are local calendar days as "YYYY-MM-DD" strings; times are "HH:mm". */

const p2 = (n: number) => String(n).padStart(2, "0");

export const fmtDate = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const todayStr = (now = new Date()) => fmtDate(now);

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

export function addMonths(s: string, n: number): string {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return fmtDate(d);
}

export const weekday = (s: string) => parseDate(s).getDay();
export const diffDays = (a: string, b: string) =>
  Math.round((Date.UTC(...ymd(a)) - Date.UTC(...ymd(b))) / 86_400_000);
const ymd = (s: string): [number, number, number] => {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m - 1, d];
};

/** Monday-or-Sunday based start of the week containing `s`. */
export function startOfWeek(s: string, weekStart: 0 | 1): string {
  const wd = weekday(s);
  return addDays(s, -((wd - weekStart + 7) % 7));
}

export function startOfMonth(s: string): string {
  return s.slice(0, 8) + "01";
}

/** 6 rows of 7 days covering the month grid. */
export function monthGrid(s: string, weekStart: 0 | 1): string[] {
  const first = startOfWeek(startOfMonth(s), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function timeToMin(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Epoch ms of a due date/time in local time. All-day tasks use `allDayHour`. */
export function dueMs(date: string, time: string | null, allDayHour = 9): number {
  const [y, m, d] = ymd(date);
  const [hh, mm] = time ? time.split(":").map(Number) : [allDayHour, 0];
  return new Date(y, m, d, hh, mm).getTime();
}

export function fmtLong(s: string, lang: string) {
  return new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }).format(parseDate(s));
}

export function fmtMonth(s: string, lang: string) {
  return new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(parseDate(s));
}

export function weekdayNames(lang: string, weekStart: 0 | 1, style: "short" | "narrow" = "short") {
  const f = new Intl.DateTimeFormat(lang, { weekday: style });
  const sunday = new Date(2023, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(1 + ((i + weekStart) % 7));
    return f.format(d);
  });
}
