import { Play, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { local, useIsMobile, useT } from "../lib/app";
import { savePlan, deletePlan } from "../lib/plan";
import { checkRange, defaultEnd, fromMin, toMin } from "../lib/planLogic";
import { pomo } from "../lib/pomoStore";
import { NotesEditor } from "./NotesEditor";
import { Sheet } from "./Sheet";
import { Button, IconButton, Field, cx, inputCls } from "./ui";

export interface PlanInit { id?: string; date: string; start: string; end: string }

/** Default for "play": a focus round as long as the block (custom when shorter than a normal round). */
const focusHere = (min: number) => { pomo.focusBlock(min); location.hash = "/pomodoro"; };

/** New or existing plan block: sheet on phones (and in the widget overlay), centered panel on desktop. */
export function PlanEditor({ init, onClose, bare, onFocus = focusHere }: { init: PlanInit; onClose: () => void; bare?: boolean; onFocus?: (min: number) => void }) {
  const mobile = useIsMobile();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (bare || mobile) return <Sheet always={bare} fit={bare} onClose={onClose}>{(close) => <Form init={init} close={close} onFocus={onFocus} />}</Sheet>;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" className="pop flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-raise shadow-xl">
        <Form init={init} close={onClose} onFocus={onFocus} inDialog />
      </div>
    </div>
  );
}

const DURATIONS = [15, 30, 60, 90, 120];

function Form({ init, close, onFocus, inDialog }: { init: PlanInit; close: () => void; onFocus: (min: number) => void; inDialog?: boolean }) {
  const t = useT();
  const editing = !!init.id;
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(init.date);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end);
  const [loaded, setLoaded] = useState(!editing);
  const bad = checkRange(start, end);

  useEffect(() => {
    if (!init.id) { document.querySelector<HTMLInputElement>("[data-plantitle]")?.focus(); return; }
    let alive = true;
    void local.get("plan", init.id).then((x) => {
      if (!alive || !x) return;
      saved.current = JSON.stringify([x.title, x.notes, x.date, x.start, x.end]);
      setTitle(x.title); setNotes(x.notes); setDate(x.date); setStart(x.start); setEnd(x.end); setLoaded(true);
    });
    return () => { alive = false; };
  }, [init.id]);

  // Existing blocks save every change by themselves: debounced while typing, at once on blur, on close and on unmount.
  const saved = useRef("");
  const gone = useRef(false);
  const latest = useRef({ title, notes, date, start, end, ok: false });
  latest.current = { title, notes, date, start, end, ok: editing && loaded && !!title.trim() && !bad };
  const flush = () => {
    const c = latest.current;
    if (!c.ok || gone.current) return;
    const key = JSON.stringify([c.title.trim(), c.notes, c.date, c.start, c.end]);
    if (key === saved.current) return;
    saved.current = key;
    void savePlan({ id: init.id, title: c.title.trim(), notes: c.notes, date: c.date, start: c.start, end: c.end });
  };
  useEffect(() => {
    if (!editing) return;
    const h = setTimeout(flush, 500);
    return () => clearTimeout(h);
  }, [title, notes, date, start, end]);
  useEffect(() => () => flush(), []);

  const add = async () => {
    if (!title.trim() || bad) return;
    await savePlan({ title: title.trim(), notes, date, start, end });
    close();
  };
  // Moving the start keeps the length
  const moveStart = (v: string) => {
    if (!checkRange(start, end) && /^\d\d:\d\d$/.test(v)) setEnd(fromMin(Math.min(toMin(v) + (toMin(end) - toMin(start)), 1439)));
    setStart(v);
  };
  const dur = !bad ? toMin(end) - toMin(start) : null;

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", !inDialog && "bg-bg")}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="pl-1 text-[15px] font-semibold">{editing ? t("planEdit") : t("planNew")}</h2>
        <div className="flex items-center">
          {editing && (
            <>
              <IconButton label={t("startFocus")} disabled={dur === null} onClick={() => { flush(); if (dur !== null) onFocus(dur); }}><Play size={16} /></IconButton>
              <IconButton label={t("delete")} onClick={() => { gone.current = true; void deletePlan(init.id!); close(); }}><Trash2 size={16} /></IconButton>
            </>
          )}
          {editing
            ? <IconButton label={t("close")} onClick={() => { flush(); close(); }}><X size={16} /></IconButton>
            : <button type="button" onClick={close} className="px-1 text-[13px] text-muted">{t("cancel")}</button>}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (!editing) void add(); }} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <input
          data-plantitle
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={flush}
          placeholder={t("planTitleHint")}
          aria-label={t("title")}
          className="w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-faint"
        />
        <NotesEditor value={notes} onChange={setNotes} onCommit={(v) => { setNotes(v); latest.current.notes = v; flush(); }} placeholder={t("addNote")} label={t("note")} />
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("planDate")}><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={t("planStart")}><input type="time" className={inputCls} value={start} onChange={(e) => moveStart(e.target.value)} /></Field>
          <Field label={t("planEnd")}><input type="time" className={cx(inputCls, bad && "border-danger")} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-muted">{t("planDur")}</span>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((m) => (
              <button
                key={m} type="button" onClick={() => setEnd(defaultEnd(start, m))}
                className={cx("h-8 rounded-ctl border px-2.5 text-[13px] tabular-nums", dur === m ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line bg-raise text-muted hover:text-fg")}
              >
                {m < 60 ? `${m} ${t("minutesShort")}` : `${m / 60} ${t("hoursShort")}`}
              </button>
            ))}
          </div>
          {bad === "order" && <p className="mt-1.5 text-[12px] text-danger">{t("planErrOrder")}</p>}
        </div>
        {!editing && <Button type="submit" variant="primary" disabled={!title.trim() || !!bad} className="h-10 w-full text-[14px]">{t("add")}</Button>}
      </form>
    </div>
  );
}
