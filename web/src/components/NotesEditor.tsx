import { useEffect, useLayoutEffect, useRef } from "react";
import { type NoteLine, formatNotes, parseNotes } from "../lib/notes";
import { Check_, cx } from "./ui";

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
  const lines = parseNotes(value);
  const els = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focus = useRef<{ i: number; pos: number } | null>(null);

  useLayoutEffect(() => {
    for (const el of els.current) if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  });
  useEffect(() => {
    const f = focus.current;
    if (!f) return;
    focus.current = null;
    const el = els.current[f.i];
    el?.focus();
    el?.setSelectionRange(f.pos, f.pos);
  });

  const set = (next: NoteLine[], f?: { i: number; pos: number }) => {
    if (f) focus.current = f;
    onChange(formatNotes(next));
  };
  const edit = (i: number, patch: Partial<NoteLine>) => set(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <div
      aria-label={label}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCommit(value); }}
      className="min-h-16 space-y-0.5 rounded-ctl border border-line bg-raise p-2.5 text-[14px] focus-within:border-accent"
    >
      {lines.map((l, i) => (
        <div key={i} className="flex items-start gap-2.5">
          {l.check && (
            <div className="pt-[3px]">
              <Check_ done={l.done} label={l.text || label} onChange={() => { const next = lines.map((x, j) => (j === i ? { ...x, done: !x.done } : x)); onChange(formatNotes(next)); onCommit(formatNotes(next)); }} />
            </div>
          )}
          <textarea
            ref={(el) => { els.current[i] = el; }}
            rows={1}
            value={l.text}
            placeholder={lines.length === 1 && !l.text ? placeholder : undefined}
            aria-label={label}
            onChange={(e) => {
              const text = e.target.value;
              if (text.includes("\n")) {
                // paste: split into lines, keeping list markers
                const pasted = parseNotes(text).map((p, k) => (k === 0 && l.check ? { ...p, check: true } : p));
                set([...lines.slice(0, i), ...pasted, ...lines.slice(i + 1)], { i: i + pasted.length - 1, pos: pasted[pasted.length - 1].text.length });
              } else if (!l.check && text.startsWith("- ")) {
                set(lines.map((x, j) => (j === i ? { check: true, done: false, text: text.slice(2) } : x)), { i, pos: text.length - 2 });
              } else edit(i, { text });
            }}
            onKeyDown={(e) => {
              const el = e.currentTarget;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (l.check && !l.text.trim()) return set(lines.map((x, j) => (j === i ? { check: false, done: false, text: "" } : x)), { i, pos: 0 });
                const pos = el.selectionStart;
                const head: NoteLine = { ...l, text: l.text.slice(0, pos) };
                const tail: NoteLine = { check: l.check, done: false, text: l.text.slice(pos) };
                set([...lines.slice(0, i), head, tail, ...lines.slice(i + 1)], { i: i + 1, pos: 0 });
              } else if (e.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
                if (l.check) {
                  e.preventDefault();
                  set(lines.map((x, j) => (j === i ? { check: false, done: false, text: x.text } : x)), { i, pos: 0 });
                } else if (i > 0) {
                  e.preventDefault();
                  const prev = lines[i - 1];
                  set([...lines.slice(0, i - 1), { ...prev, text: prev.text + l.text }, ...lines.slice(i + 1)], { i: i - 1, pos: prev.text.length });
                }
              }
            }}
            className={cx("min-w-0 flex-1 resize-none overflow-hidden bg-transparent leading-[1.45] placeholder:text-faint", l.check && l.done && "text-faint line-through")}
          />
        </div>
      ))}
    </div>
  );
}
