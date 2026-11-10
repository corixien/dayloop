/** Notes are plain text; lines like "- [ ] foo" / "- [x] foo" are checklist items (the former subtasks). */
const CHECK = /^- \[( |x)(?:@(\d+))?(?:#([a-z0-9]{3,12}))?\] ?/;

export interface NoteLine {
  check: boolean;
  done: boolean;
  /** completion time (ms), written when ticked; older items have none */
  at?: number;
  /** stable id, written when a plan block links the point ("- [ #a3f9] x", "- [x@<ms>#a3f9] x"); hidden in the editor */
  id?: string;
  text: string;
}

export const parseLine = (l: string): NoteLine => {
  const m = CHECK.exec(l);
  return m
    ? { check: true, done: m[1] === "x", ...(m[2] ? { at: Number(m[2]) } : {}), ...(m[3] ? { id: m[3] } : {}), text: l.slice(m[0].length) }
    : { check: false, done: false, text: l };
};
export const formatLine = (l: NoteLine) => (l.check ? `- [${l.done ? `x${l.at ? `@${l.at}` : ""}` : " "}${l.id ? `#${l.id}` : ""}] ${l.text}` : l.text);
export const parseNotes = (notes: string) => notes.split("\n").map(parseLine);
export const formatNotes = (lines: NoteLine[]) => lines.map(formatLine).join("\n");

/**
 * Inline formatting inside a note line: **bold**, *italic*, ***both***. Markers hug the text (no space inside), so a
 * stray "*" (as in "3 * 4") stays plain.
 */
const MARKS = /\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*|\*\*(?!\s)(.+?)(?<!\s)\*\*|\*(?!\s)(.+?)(?<!\s)\*/g;
export interface Span { text: string; bold?: boolean; italic?: boolean }
export function parseMarks(s: string): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const m of s.matchAll(MARKS)) {
    if (m.index! > at) out.push({ text: s.slice(at, m.index) });
    out.push(m[1] !== undefined ? { text: m[1], bold: true, italic: true } : m[2] !== undefined ? { text: m[2], bold: true } : { text: m[3], italic: true });
    at = m.index! + m[0].length;
  }
  if (at < s.length) out.push({ text: s.slice(at) });
  return out;
}
/** The text without formatting markers (for titles, calendar chips, matching names). */
export const stripMarks = (s: string) => s.replace(MARKS, (_m, a, b, c) => a ?? b ?? c);

/** Wrap / unwrap the selection [s, e) of `text` in a marker ("**" bold, "*" italic). Returns the new text and selection. */
export function toggleMark(text: string, s: number, e: number, marker: "**" | "*"): { text: string; s: number; e: number } {
  if (s === e) {
    // no selection: take the word around the caret
    while (s > 0 && /[^\s*]/.test(text[s - 1])) s--;
    while (e < text.length && /[^\s*]/.test(text[e])) e++;
    if (s === e) return { text: text.slice(0, s) + marker + marker + text.slice(e), s: s + marker.length, e: s + marker.length };
  }
  let n = 0, m = 0;
  while (text[s - 1 - n] === "*") n++;
  while (text[e + m] === "*") m++;
  const k = Math.min(n, m);
  const remove = marker === "**" ? k >= 2 : k === 1 || k === 3;
  if (remove) {
    const w = marker.length;
    return { text: text.slice(0, s - w) + text.slice(s, e) + text.slice(e + w), s: s - w, e: e - w };
  }
  return { text: text.slice(0, s) + marker + text.slice(s, e) + marker + text.slice(e), s: s + marker.length, e: e + marker.length };
}

/** Checklist progress, first plain text line, and whether there is any plain note text. */
export function noteStats(notes: string) {
  let total = 0, done = 0, first = "";
  for (const l of parseNotes(notes)) {
    if (l.check) { total++; if (l.done) done++; } else if (!first && l.text.trim()) first = stripMarks(l.text.trim());
  }
  return { total, done, first };
}

/** A repeating task starts its next round with all checklist items unchecked. */
export const uncheckAll = (notes: string) => notes.replace(/^- \[x(?:@\d+)?(#[a-z0-9]+)?\]/gm, (_m, id) => `- [ ${id ?? ""}]`);

/** Checklist items that were ticked with a known time (for the calendar). */
export const doneItems = (notes: string) => parseNotes(notes).filter((l) => l.check && l.done && l.at).map((l) => ({ text: stripMarks(l.text), at: l.at! }));

/** Tick/untick: remembers when. */
export const toggled = (l: NoteLine): NoteLine => (l.done ? { check: true, done: false, ...(l.id ? { id: l.id } : {}), text: l.text } : { ...l, done: true, at: Date.now() });

const newId = () => Math.random().toString(36).slice(2, 6).padEnd(4, "0");

/** A point's id; gives the checklist line at `index` one when it has none. Returns the new notes and the id. */
export function ensurePointId(notes: string, index: number): { notes: string; id: string } {
  const lines = parseNotes(notes);
  const l = lines[index];
  if (l.id) return { notes, id: l.id };
  const used = new Set(lines.map((x) => x.id));
  let id = newId();
  while (used.has(id)) id = newId();
  lines[index] = { ...l, id };
  return { notes: formatNotes(lines), id };
}

/** Add a new unchecked point (with an id) at the end of the checklist, after the last checklist line or the notes. */
export function appendPoint(notes: string, text: string): { notes: string; id: string } {
  const lines = parseNotes(notes);
  const used = new Set(lines.map((x) => x.id));
  let id = newId();
  while (used.has(id)) id = newId();
  const last = lines.reduce((m, l, i) => (l.check ? i : m), -1);
  const at = last >= 0 ? last + 1 : lines.length;
  const line: NoteLine = { check: true, done: false, id, text };
  if (!notes.trim()) return { notes: formatNotes([line]), id };
  lines.splice(at, 0, line);
  return { notes: formatNotes(lines), id };
}

/** Remove the checklist point with this id (or, without an id, at this position). Unchanged notes when it is gone. */
export function removePoint(notes: string, ref: { id?: string; index: number }): string {
  const lines = parseNotes(notes);
  const i = ref.id ? lines.findIndex((l) => l.check && l.id === ref.id) : ref.index;
  if (!lines[i]?.check) return notes;
  lines.splice(i, 1);
  return formatNotes(lines);
}
