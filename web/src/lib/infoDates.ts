/**
 * Quiet background dates for the calendar: public holidays (Brandenburg), school breaks, Abitur dates and a few well-known days,
 * plus own `info` items (synced). Built-in school dates come from the Brandenburg ministry (Abitur circulars 06/25 and 06/26) and
 * public holiday sites (breaks, no guarantee): check them against the school's own announcements.
 */
import { addDays, diffDays, fmtDate, parseDate } from "./dates";
import type { Lang } from "./i18n";

export type InfoKind = "holiday" | "school" | "exam" | "day" | "custom";
export interface Info { id: string; title: string; date: string; end: string; kind: InfoKind }

const iso = (y: number, m: number, d: number) => fmtDate(new Date(y, m - 1, d));

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher). */
export function easter(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(y, month, day);
}

/** n-th (1-based) given weekday (0 = Sunday) of a month, or the last one with n = -1. */
function nthWeekday(y: number, m: number, wd: number, n: number): string {
  if (n > 0) {
    const first = new Date(y, m - 1, 1).getDay();
    return iso(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(y, m, 0);
  return iso(y, m, last.getDate() - ((last.getDay() - wd + 7) % 7));
}

const T = (de: string, en: string) => ({ de, en });
type Title = ReturnType<typeof T>;

function yearly(y: number): { date: string; end?: string; title: Title; kind: InfoKind }[] {
  const e = easter(y);
  const himmelfahrt = addDays(e, 39);
  return [
    { date: iso(y, 1, 1), title: T("Neujahr", "New Year's Day"), kind: "holiday" },
    { date: iso(y, 2, 14), title: T("Valentinstag", "Valentine's Day"), kind: "day" },
    { date: addDays(e, -2), title: T("Karfreitag", "Good Friday"), kind: "holiday" },
    { date: e, title: T("Ostersonntag", "Easter Sunday"), kind: "holiday" },
    { date: addDays(e, 1), title: T("Ostermontag", "Easter Monday"), kind: "holiday" },
    { date: nthWeekday(y, 3, 0, -1), title: T("Sommerzeit beginnt", "Daylight saving starts"), kind: "day" },
    { date: iso(y, 5, 1), title: T("Tag der Arbeit", "Labour Day"), kind: "holiday" },
    { date: nthWeekday(y, 5, 0, 2), title: T("Muttertag", "Mother's Day"), kind: "day" },
    { date: himmelfahrt, title: T("Christi Himmelfahrt / Vatertag", "Ascension / Father's Day"), kind: "holiday" },
    { date: addDays(e, 49), title: T("Pfingstsonntag", "Whit Sunday"), kind: "holiday" },
    { date: addDays(e, 50), title: T("Pfingstmontag", "Whit Monday"), kind: "holiday" },
    { date: iso(y, 10, 3), title: T("Tag der Deutschen Einheit", "German Unity Day"), kind: "holiday" },
    { date: nthWeekday(y, 10, 0, -1), title: T("Winterzeit beginnt", "Daylight saving ends"), kind: "day" },
    { date: iso(y, 10, 31), title: T("Reformationstag", "Reformation Day"), kind: "holiday" },
    { date: iso(y, 12, 6), title: T("Nikolaus", "St Nicholas Day"), kind: "day" },
    { date: iso(y, 12, 24), title: T("Heiligabend", "Christmas Eve"), kind: "day" },
    { date: iso(y, 12, 25), title: T("1. Weihnachtstag", "Christmas Day"), kind: "holiday" },
    { date: iso(y, 12, 26), title: T("2. Weihnachtstag", "Boxing Day"), kind: "holiday" },
    { date: iso(y, 12, 31), title: T("Silvester", "New Year's Eve"), kind: "day" },
  ];
}

/** [first day, last day, German title, English title] */
const BREAKS: [string, string, string, string][] = [
  ["2026-07-09", "2026-08-22", "Sommerferien", "Summer break"],
  ["2026-10-19", "2026-10-30", "Herbstferien", "Autumn break"],
  ["2026-12-23", "2027-01-02", "Weihnachtsferien", "Christmas break"],
  ["2027-02-01", "2027-02-06", "Winterferien", "Winter break"],
  ["2027-03-22", "2027-04-03", "Osterferien", "Easter break"],
  ["2027-05-07", "2027-05-07", "Schulfreier Tag", "No school"],
  ["2027-05-18", "2027-05-18", "Schulfreier Tag", "No school"],
  ["2027-07-01", "2027-08-14", "Sommerferien", "Summer break"],
  ["2027-10-11", "2027-10-23", "Herbstferien", "Autumn break"],
  ["2027-12-23", "2027-12-31", "Weihnachtsferien", "Christmas break"],
  ["2028-01-31", "2028-02-05", "Winterferien", "Winter break"],
  ["2028-04-10", "2028-04-22", "Osterferien", "Easter break"],
  ["2028-05-26", "2028-05-26", "Schulfreier Tag", "No school"],
  ["2028-06-29", "2028-08-12", "Sommerferien", "Summer break"],
  ["2028-10-02", "2028-10-14", "Herbstferien", "Autumn break"],
  ["2028-10-30", "2028-10-30", "Schulfreier Tag", "No school"],
  ["2028-12-22", "2029-01-02", "Weihnachtsferien", "Christmas break"],
  ["2029-01-29", "2029-02-03", "Winterferien", "Winter break"],
  ["2029-03-26", "2029-04-06", "Osterferien", "Easter break"],
  ["2029-04-30", "2029-04-30", "Schulfreier Tag", "No school"],
  ["2029-05-11", "2029-05-11", "Schulfreier Tag", "No school"],
  ["2029-05-22", "2029-05-22", "Schulfreier Tag", "No school"],
  ["2029-06-28", "2029-08-11", "Sommerferien", "Summer break"],
];

/** [date, German, English, last day (range)] -- Abitur Brandenburg, MBJS circulars 06/25 (2027) and 06/26 (2028) */
const ABITUR: [string, string, string, string?][] = [
  ["2027-04-15", "Abitur: Zulassung bekannt, letzter Unterrichtstag", "Abitur: admission announced, last lesson day"],
  ["2027-04-16", "Abitur Biologie", "Abitur Biology"],
  ["2027-04-20", "Abitur Physik", "Abitur Physics"],
  ["2027-04-21", "Abitur Chemie", "Abitur Chemistry"],
  ["2027-04-26", "Abitur Geo/Geschichte/PB (LK)", "Abitur Geo/History/Politics (advanced)"],
  ["2027-04-28", "Abitur Deutsch", "Abitur German"],
  ["2027-04-30", "Abitur Englisch", "Abitur English"],
  ["2027-05-03", "Abitur Französisch", "Abitur French"],
  ["2027-05-05", "Abitur Mathematik", "Abitur Maths"],
  ["2027-05-10", "Abitur Geo/Geschichte/PB (GK)", "Abitur Geo/History/Politics (basic)"],
  ["2027-05-13", "Mündliche Abiturprüfungen", "Oral Abitur exams", "2027-06-02"],
  ["2027-05-14", "Nachschreiben Abitur Deutsch", "Abitur resit German"],
  ["2027-05-19", "Nachschreiben Abitur Englisch", "Abitur resit English"],
  ["2027-05-21", "Nachschreiben Abitur Geo/Gesch/PB (LK)", "Abitur resit Geo/History/Politics (adv.)"],
  ["2027-05-24", "Nachschreiben Abitur Mathematik", "Abitur resit Maths"],
  ["2027-05-26", "Nachschreiben Abitur Bio/Chemie/Physik", "Abitur resit Bio/Chem/Physics"],
  ["2027-05-28", "Nachschreiben Abitur Geo/Gesch/PB (GK)", "Abitur resit Geo/History/Politics (basic)"],
  ["2027-05-31", "Nachschreiben Abitur Französisch", "Abitur resit French"],
  ["2027-06-30", "Abiturzeugnisse (spätestens)", "Abitur certificates (latest)"],
  ["2028-04-06", "Abitur: Zulassung bekannt, letzter Unterrichtstag", "Abitur: admission announced, last lesson day"],
  ["2028-04-07", "Abitur Geo/Geschichte/PB (LK)", "Abitur Geo/History/Politics (advanced)"],
  ["2028-04-24", "Abitur Geo/Geschichte/PB (GK)", "Abitur Geo/History/Politics (basic)"],
  ["2028-04-26", "Abitur Deutsch", "Abitur German"],
  ["2028-04-28", "Abitur Englisch", "Abitur English"],
  ["2028-05-03", "Abitur Mathematik", "Abitur Maths"],
  ["2028-05-05", "Abitur Französisch", "Abitur French"],
  ["2028-05-09", "Abitur Biologie", "Abitur Biology"],
  ["2028-05-10", "Abitur Physik", "Abitur Physics"],
  ["2028-05-11", "Abitur Chemie", "Abitur Chemistry"],
  ["2028-05-15", "Mündliche Abiturprüfungen", "Oral Abitur exams"],
  ["2028-05-16", "Nachschreiben Abitur Geo/Gesch/PB (LK)", "Abitur resit Geo/History/Politics (adv.)"],
  ["2028-05-17", "Nachschreiben Abitur Geo/Gesch/PB (GK)", "Abitur resit Geo/History/Politics (basic)"],
  ["2028-05-22", "Nachschreiben Abitur Deutsch", "Abitur resit German"],
  ["2028-05-24", "Nachschreiben Abitur Englisch", "Abitur resit English"],
  ["2028-05-29", "Nachschreiben Abitur Mathematik", "Abitur resit Maths"],
  ["2028-05-30", "Nachschreiben Abitur Bio/Chemie/Physik", "Abitur resit Bio/Chem/Physics"],
  ["2028-06-06", "Nachschreiben Abitur Französisch", "Abitur resit French"],
  ["2028-06-28", "Abiturzeugnisse (spätestens)", "Abitur certificates (latest)"],
];

/** Everything that touches [from, to]: built-ins plus own items. Ranges appear once with their first and last day. */
export function infoRanges(from: string, to: string, lang: Lang, custom: { id: string; title: string; date: string; endDate: string | null }[] = []): Info[] {
  const out: Info[] = [];
  const add = (id: string, title: string, date: string, end: string | undefined, kind: InfoKind) => {
    const last = end ?? date;
    if (last >= from && date <= to) out.push({ id, title, date, end: last, kind });
  };
  const y0 = parseDate(from).getFullYear(), y1 = parseDate(to).getFullYear();
  for (let y = y0; y <= y1; y++) for (const x of yearly(y)) add(`b:${x.date}:${x.title.de}`, x.title[lang], x.date, x.end, x.kind);
  for (const [a, b, de, en] of BREAKS) add(`s:${a}`, lang === "de" ? de : en, a, b, "school");
  for (const [d, de, en, end] of ABITUR) add(`x:${d}:${de}`, lang === "de" ? de : en, d, end, "exam");
  for (const c of custom) add(`c:${c.id}`, c.title, c.date, c.endDate ?? undefined, "custom");
  return out;
}

/** Info by day for the visible days, with `first` set on the day a label should be drawn (first visible day of a range). */
export function infoByDay(days: string[], lang: Lang, custom: Parameters<typeof infoRanges>[3] = []): Map<string, (Info & { first: boolean })[]> {
  const map = new Map<string, (Info & { first: boolean })[]>();
  if (!days.length) return map;
  const from = days[0], to = days[days.length - 1];
  for (const r of infoRanges(from, to, lang, custom)) {
    const span = diffDays(r.end, r.date);
    let first = true;
    for (let i = 0; i <= span; i++) {
      const d = addDays(r.date, i);
      if (d < from || d > to) continue;
      map.set(d, [...(map.get(d) ?? []), { ...r, first }]);
      first = false;
    }
  }
  return map;
}
