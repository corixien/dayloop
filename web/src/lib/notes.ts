/** Notes are plain text; lines like "- [ ] foo" / "- [x] foo" are checklist items (the former subtasks). */
const CHECK = /^- \[( |x)\] ?/;

export interface NoteLine {
  check: boolean;
  done: boolean;
  text: string;
}

export const parseLine = (l: string): NoteLine => {
  const m = CHECK.exec(l);
  return m ? { check: true, done: m[1] === "x", text: l.slice(m[0].length) } : { check: false, done: false, text: l };
};
export const formatLine = (l: NoteLine) => (l.check ? `- [${l.done ? "x" : " "}] ${l.text}` : l.text);
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
export const uncheckAll = (notes: string) => notes.replace(/^- \[x\]/gm, "- [ ]");
