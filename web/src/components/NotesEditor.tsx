import { useEffect, useLayoutEffect, useRef } from "react";
import { type NoteLine, formatNotes, parseNotes, toggled } from "../lib/notes";
import { Check_, cx } from "./ui";

/**
 * Every line is its own textarea. To let the caret travel between lines like in one text field (arrow keys, and the
 * space-bar slide on phone keyboards, which only emits selection changes), each textarea holds its text between two
 * zero-width sentinels: the caret reaching a sentinel means "beyond this line" and moves focus to the neighbour.
 */
const ZW = "​";
const wrap = (s: string) => ZW + s + ZW;
const strip = (s: string) => s.replaceAll(ZW, "");
const LINE_H = 20;

/** Is the caret on the first / last visual line of a (wrapped) textarea? Measured with a hidden copy. */
function caretEdge(el: HTMLTextAreaElement) {
  const cs = getComputedStyle(el);
  const m = document.createElement("div");
  Object.assign(m.style, { position: "absolute", visibility: "hidden", width: `${el.clientWidth}px`, font: cs.font, letterSpacing: cs.letterSpacing, whiteSpace: "pre-wrap", overflowWrap: "break-word", lineHeight: `${LINE_H}px` });
  m.textContent = `${el.value.slice(0, el.selectionStart)}x`;
  document.body.appendChild(m);
  const before = Math.round(m.offsetHeight / LINE_H);
  m.remove();
  const total = Math.max(1, Math.round(el.scrollHeight / LINE_H));
  return { first: before <= 1, last: before >= total };
}

/**
 * Notes with inline checklists: each line is plain text or a round checkbox item. Typing "- " at the start of a
 * line turns it into a checkbox; Enter continues the list (twice ends it), Backspace at the start undoes it.
 */
export function NotesEditor({
  value, onChange, onCommit, placeholder, label,
}: {
  value: string;
  onChange: (v: string) => void;
  /** called when focus leaves the editor and right after a checkbox toggle */
  onCommit: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const lines = parseNotes(value.split(ZW).join(""));
  const els = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focus = useRef<{ i: number; pos: number } | null>(null);
  /** true while a pointer is on a line: taps may land on a sentinel and must not jump lines */
  const pointer = useRef(false);

  useLayoutEffect(() => {
    for (const el of els.current) if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  });
  useEffect(() => {
    const f = focus.current;
    if (!f) return;
    focus.current = null;
    const el = els.current[f.i];
    el?.focus();
    el?.setSelectionRange(f.pos + 1, f.pos + 1);
  });

  // The caret reaching a sentinel (space-bar slide, arrow keys, IME) moves on to the neighbouring line. Taps and clicks can also
  // land on a sentinel: they only get clamped (the pointer flag).
  useEffect(() => {
    const onSel = () => {
      const el = document.activeElement as HTMLTextAreaElement | null;
      const i = el ? els.current.indexOf(el) : -1;
      if (!el || i < 0) return;
      const n = el.value.length;
      const { selectionStart: a, selectionEnd: b } = el;
      if (a === b && !pointer.current) {
        if (a === 0 && i > 0) return go(i - 1, Infinity);
        if (a === n && i < lines.length - 1) return go(i + 1, 0);
      }
      if (a < 1 || b > n - 1) el.setSelectionRange(Math.max(a, 1), Math.min(Math.max(b, 1), n - 1));
    };
    const down = (e: Event) => { if ((e.target as Element | null)?.closest?.("[data-notes]")) pointer.current = true; };
    const up = () => { setTimeout(() => { pointer.current = false; }, 400); };
    document.addEventListener("selectionchange", onSel, true);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      document.removeEventListener("selectionchange", onSel, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  });

  const set = (next: NoteLine[], f?: { i: number; pos: number }) => {
    if (f) focus.current = f;
    onChange(formatNotes(next));
  };
  const edit = (i: number, patch: Partial<NoteLine>) => set(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  /** move the caret into another line without changing the text */
  const go = (i: number, pos: number) => {
    const el = els.current[i];
    if (!el) return;
    el.focus();
    const p = Math.min(Math.max(pos, 0), strip(el.value).length) + 1;
    el.setSelectionRange(p, p);
  };
  const joinPrev = (i: number) => {
    const prev = lines[i - 1];
    set([...lines.slice(0, i - 1), { ...prev, text: prev.text + lines[i].text }, ...lines.slice(i + 1)], { i: i - 1, pos: prev.text.length });
  };
  const unlist = (i: number) => set(lines.map((x, j) => (j === i ? { check: false, done: false, text: x.text } : x)), { i, pos: 0 });

  return (
    <div
      aria-label={label}
      data-notes
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit(value); }}
      className="min-h-16 space-y-0.5 rounded-ctl border border-line bg-raise p-2.5 text-[14px] focus-within:border-accent"
    >
      {lines.map((l, i) => (
        <div key={i} className="flex items-start gap-2.5">
          {l.check && (
            <div className="flex h-5 items-center">
              <Check_ done={l.done} label={l.text || label} onChange={() => { const next = lines.map((x, j) => (j === i ? toggled(x) : x)); onChange(formatNotes(next)); onCommit(formatNotes(next)); }} />
            </div>
          )}
          <div className="relative min-w-0 flex-1">
            {lines.length === 1 && !l.text && <span aria-hidden className="pointer-events-none absolute left-0 top-0 leading-5 text-faint">{placeholder}</span>}
            <textarea
              ref={(el) => { els.current[i] = el; }}
              rows={1}
              value={wrap(l.text)}
              aria-label={label}
              onChange={(e) => {
                const raw = e.target.value;
                const text = strip(raw);
                if (!raw.startsWith(ZW) && text === l.text) {
                  // Backspace removed the leading sentinel: the caret was at the start of the line
                  if (l.check) return unlist(i);
                  if (i > 0) return joinPrev(i);
                  return focus.current = { i, pos: 0 }, set(lines);
                }
                if (!raw.endsWith(ZW) && text === l.text) {
                  // Delete removed the trailing sentinel: pull the next line up
                  if (i < lines.length - 1) {
                    const next = lines[i + 1];
                    return set([...lines.slice(0, i), { ...l, text: l.text + next.text }, ...lines.slice(i + 2)], { i, pos: l.text.length });
                  }
                  return focus.current = { i, pos: l.text.length }, set(lines);
                }
                if (text.includes("\n")) {
                  // paste: split into lines, keeping list markers
                  const pasted = parseNotes(text).map((p, k) => (k === 0 && l.check ? { ...p, check: true } : p));
                  set([...lines.slice(0, i), ...pasted, ...lines.slice(i + 1)], { i: i + pasted.length - 1, pos: pasted[pasted.length - 1].text.length });
                } else if (!l.check && text.startsWith("- ")) {
                  set(lines.map((x, j) => (j === i ? { check: true, done: false, text: text.slice(2) } : x)), { i, pos: text.length - 2 });
                } else {
                  edit(i, { text });
                }
              }}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                const pos = el.selectionStart - 1;
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (l.check && !l.text.trim()) return set(lines.map((x, j) => (j === i ? { check: false, done: false, text: "" } : x)), { i, pos: 0 });
                  const head: NoteLine = { ...l, text: l.text.slice(0, pos) };
                  const tail: NoteLine = { check: l.check, done: false, text: l.text.slice(pos) };
                  set([...lines.slice(0, i), head, tail, ...lines.slice(i + 1)], { i: i + 1, pos: 0 });
                } else if (e.key === "Backspace" && pos <= 0 && el.selectionEnd <= 1) {
                  e.preventDefault();
                  if (l.check) unlist(i);
                  else if (i > 0) joinPrev(i);
                } else if (e.key === "Home" && !e.shiftKey) {
                  e.preventDefault();
                  go(i, 0);
                } else if (e.key === "End" && !e.shiftKey) {
                  e.preventDefault();
                  go(i, l.text.length);
                } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && el.selectionStart === el.selectionEnd) {
                  // the sentinel is invisible, so browsers do not stop on it: handle the line ends ourselves
                  if (e.key === "ArrowRight" && el.selectionStart >= el.value.length - 1 && i < lines.length - 1) { e.preventDefault(); go(i + 1, 0); }
                  else if (e.key === "ArrowLeft" && el.selectionStart <= 1 && i > 0) { e.preventDefault(); go(i - 1, Infinity); }
                } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                  const edge = caretEdge(el);
                  const up = e.key === "ArrowUp";
                  if (up ? edge.first && i > 0 : edge.last && i < lines.length - 1) {
                    e.preventDefault();
                    const col = edge.first && edge.last ? pos : up ? pos : 0;
                    go(up ? i - 1 : i + 1, up ? Math.min(col, lines[i - 1].text.length) : Math.min(col, lines[i + 1].text.length));
                  }
                }
              }}
              className={cx("block min-w-0 w-full resize-none overflow-hidden border-0 bg-transparent p-0 leading-5 outline-none focus-visible:outline-none", l.check && l.done && "text-faint line-through")}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
