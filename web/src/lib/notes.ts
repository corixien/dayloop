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

/** Checklist progress, first plain text line, and whether there is any plain note text. */
export function noteStats(notes: string) {
  let total = 0, done = 0, first = "";
  for (const l of parseNotes(notes)) {
    if (l.check) { total++; if (l.done) done++; } else if (!first && l.text.trim()) first = l.text.trim();
  }
  return { total, done, first };
}

/** A repeating task starts its next round with all checklist items unchecked. */
export const uncheckAll = (notes: string) => notes.replace(/^- \[x(@\d+)?\]/gm, "- [ ]");

/** Checklist items that were ticked with a known time (for the calendar). */
export const doneItems = (notes: string) => parseNotes(notes).filter((l) => l.check && l.done && l.at).map((l) => ({ text: l.text, at: l.at! }));

/** Tick/untick: remembers when. */
export const toggled = (l: NoteLine): NoteLine => (l.done ? { check: true, done: false, text: l.text } : { ...l, done: true, at: Date.now() });
