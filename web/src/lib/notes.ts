/** Notes are plain text; lines like "- [ ] foo" / "- [x] foo" are checklist items (the former subtasks). */
const CHECK = /^- \[( |x(?:@(\d+))?)\] ?/;

export interface NoteLine {
  check: boolean;
  done: boolean;
  /** completion time (ms), written when ticked; older items have none */
  at?: number;
  text: string;
}

export const parseLine = (l: string): NoteLine => {
  const m = CHECK.exec(l);
  return m
    ? { check: true, done: m[1][0] === "x", ...(m[2] ? { at: Number(m[2]) } : {}), text: l.slice(m[0].length) }
    : { check: false, done: false, text: l };
};
export const formatLine = (l: NoteLine) => (l.check ? `- [${l.done ? `x${l.at ? `@${l.at}` : ""}` : " "}] ${l.text}` : l.text);
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
export const uncheckAll = (notes: string) => notes.replace(/^- \[x(@\d+)?\]/gm, "- [ ]");

/** Checklist items that were ticked with a known time (for the calendar). */
export const doneItems = (notes: string) => parseNotes(notes).filter((l) => l.check && l.done && l.at).map((l) => ({ text: stripMarks(l.text), at: l.at! }));

/** Tick/untick: remembers when. */
export const toggled = (l: NoteLine): NoteLine => (l.done ? { check: true, done: false, text: l.text } : { ...l, done: true, at: Date.now() });
