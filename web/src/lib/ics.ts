import type { Task } from "@dayloop/shared";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const d8 = (d: string) => d.replace(/-/g, "");
const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Calendar export of all open tasks that have a due date (RFC 5545). */
export function tasksToIcs(tasks: (Task & { id: string })[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dayloop//EN", "CALSCALE:GREGORIAN"];
  for (const t of tasks) {
    if (!t.dueDate || t.done || t.trashedAt !== null) continue;
    lines.push("BEGIN:VEVENT", `UID:${t.id}@dayloop`, `DTSTAMP:${stamp}`);
    if (t.dueTime) {
      const [h, m] = t.dueTime.split(":").map(Number);
      const end = new Date(2000, 0, 1, h, m + 30);
      const hm = (hh: number, mm: number) => String(hh).padStart(2, "0") + String(mm).padStart(2, "0") + "00";
      lines.push(`DTSTART:${d8(t.dueDate)}T${hm(h, m)}`, `DTEND:${d8(t.dueDate)}T${hm(end.getHours(), end.getMinutes())}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d8(t.dueDate)}`);
    }
    lines.push(`SUMMARY:${esc(t.title)}`);
    if (t.notes) lines.push(`DESCRIPTION:${esc(t.notes)}`);
    if (t.repeat) {
      let r = `RRULE:FREQ=${t.repeat.freq.toUpperCase()};INTERVAL=${t.repeat.interval}`;
      if (t.repeat.freq === "weekly" && t.repeat.byWeekday?.length) r += `;BYDAY=${t.repeat.byWeekday.map((d) => BYDAY[d]).join(",")}`;
      if (t.repeat.until) r += `;UNTIL=${d8(t.repeat.until)}`;
      lines.push(r);
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
