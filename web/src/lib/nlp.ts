import type { Repeat } from "@dayloop/shared";
import { addDays, fmtDate, weekday } from "./dates";

export interface Parsed {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  priority: number;
  tags: string[];
  list: string | null;
  repeat: Repeat | null;
}

const WEEKDAYS: Record<string, number> = {
  so: 0, sonntag: 0, sun: 0, sunday: 0,
  mo: 1, montag: 1, mon: 1, monday: 1,
  di: 2, dienstag: 2, tue: 2, tuesday: 2,
  mi: 3, mittwoch: 3, wed: 3, wednesday: 3,
  do: 4, donnerstag: 4, thu: 4, thursday: 4,
  fr: 5, freitag: 5, fri: 5, friday: 5,
  sa: 6, samstag: 6, sat: 6, saturday: 6,
};
const wdNames = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");

/** Quick-add parser: "Zahnarzt morgen 15 Uhr !1 #privat ~Gesundheit jeden montag" (DE/EN). */
export function parseQuickAdd(input: string, now = new Date()): Parsed {
  let s = ` ${input} `;
  const out: Parsed = { title: "", dueDate: null, dueTime: null, priority: 0, tags: [], list: null, repeat: null };
  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    const m = re.exec(s);
    if (m) {
      fn(m);
      s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
    }
  };
  const today = fmtDate(now);

  take(/\s!([123])(?=\s)/, (m) => (out.priority = { "1": 3, "2": 2, "3": 1 }[m[1]]!));
  for (let m: RegExpExecArray | null; (m = /\s#([^\s#~!]+)/.exec(s)); ) {
    out.tags.push(m[1]);
    s = s.slice(0, m.index) + " " + s.slice(m.index + m[0].length);
  }
  take(/\s~([^\s#~!]+)/, (m) => (out.list = m[1]));

  // repeat
  const each = new RegExp(`\\s(?:jeden|every)\\s+(${wdNames})(?=\\s)`, "i");
  take(each, (m) => (out.repeat = { freq: "weekly", interval: 1, byWeekday: [WEEKDAYS[m[1].toLowerCase()]] }));
  if (!out.repeat) {
    take(/\s(t(?:ä|ae)glich|daily|every day|jeden tag)(?=\s)/i, () => (out.repeat = { freq: "daily", interval: 1 }));
    take(/\s(w(?:ö|oe)chentlich|weekly|every week|jede woche)(?=\s)/i, () => (out.repeat = { freq: "weekly", interval: 1 }));
    take(/\s(monatlich|monthly|every month|jeden monat)(?=\s)/i, () => (out.repeat = { freq: "monthly", interval: 1 }));
    take(/\s(j(?:ä|ae)hrlich|yearly|every year|jedes jahr)(?=\s)/i, () => (out.repeat = { freq: "yearly", interval: 1 }));
  }

  // time
  take(/\s(?:um |at )?([01]?\d|2[0-3]):([0-5]\d)(?:\s?uhr)?(?=\s)/i, (m) => (out.dueTime = `${m[1].padStart(2, "0")}:${m[2]}`));
  if (!out.dueTime) {
    take(/\s(?:um |at )?(1[0-2]|0?[1-9])\s?(am|pm)(?=\s)/i, (m) => {
      let h = Number(m[1]) % 12;
      if (m[2].toLowerCase() === "pm") h += 12;
      out.dueTime = `${String(h).padStart(2, "0")}:00`;
    });
  }
  if (!out.dueTime) {
    take(/\s(?:um )?([01]?\d|2[0-3])\s?uhr(?=\s)/i, (m) => (out.dueTime = `${m[1].padStart(2, "0")}:00`));
  }

  // date
  const setIn = (n: number) => (out.dueDate = addDays(today, n));
  let found = false;
  const tryDate = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    if (found) return;
    take(re, (m) => {
      found = true;
      fn(m);
    });
  };
  tryDate(/\s(?:heute|today)(?=\s)/i, () => setIn(0));
  tryDate(/\s(?:[uü]bermorgen|day after tomorrow)(?=\s)/i, () => setIn(2));
  tryDate(/\s(?:morgen|tomorrow)(?=\s)/i, () => setIn(1));
  tryDate(/\s(?:in )(\d{1,3}) (?:tagen?|days?)(?=\s)/i, (m) => setIn(Number(m[1])));
  tryDate(/\s(?:in )(\d{1,2}) (?:wochen?|weeks?)(?=\s)/i, (m) => setIn(Number(m[1]) * 7));
  tryDate(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => (out.dueDate = `${m[1]}-${m[2]}-${m[3]}`));
  tryDate(/\s(\d{1,2})\.(\d{1,2})\.(\d{2,4})?(?=\s)/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
    let d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && fmtDate(d) < today) d = new Date(y + 1, Number(m[2]) - 1, Number(m[1]));
    out.dueDate = fmtDate(d);
  });
  tryDate(new RegExp(`\\s(?:(?:am|on|next|n[aä]chsten?) )?(${wdNames})(?=\\s)`, "i"), (m) => {
    const target = WEEKDAYS[m[1].toLowerCase()];
    const diff = (target - weekday(today) + 7) % 7 || 7;
    setIn(diff);
  });
  if (out.dueTime && !out.dueDate && !out.repeat) out.dueDate = today;
  if (out.repeat && !out.dueDate) {
    const wd = out.repeat.byWeekday?.[0];
    out.dueDate = wd === undefined ? today : addDays(today, (wd - weekday(today) + 7) % 7);
  }

  out.title = s.replace(/\s+/g, " ").trim();
  return out;
}
