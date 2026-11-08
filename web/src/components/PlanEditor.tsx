import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { local, useIsMobile, useT } from "../lib/app";
import { savePlan, deletePlan } from "../lib/plan";
import { checkRange, defaultEnd, fromMin, toMin } from "../lib/planLogic";
import { NotesEditor } from "./NotesEditor";
import { Sheet } from "./Sheet";
import { Button, Dialog, Field, cx, inputCls } from "./ui";

export interface PlanInit { id?: string; date: string; start: string; end: string }

/** New or existing plan block: sheet on phones (and in the widget overlay), dialog on desktop. */
export function PlanEditor({ init, onClose, bare }: { init: PlanInit; onClose: () => void; bare?: boolean }) {
  const mobile = useIsMobile();
  const t = useT();
  if (bare || mobile) return <Sheet always={bare} fit={bare} onClose={onClose}>{(close) => <Form init={init} close={close} />}</Sheet>;
  return <Dialog title={init.id ? t("planEdit") : t("planNew")} onClose={onClose} wide><Form init={init} close={onClose} inDialog /></Dialog>;
}

const DURATIONS = [15, 30, 60, 90, 120];

function Form({ init, close, inDialog }: { init: PlanInit; close: () => void; inDialog?: boolean }) {
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
      setTitle(x.title); setNotes(x.notes); setDate(x.date); setStart(x.start); setEnd(x.end); setLoaded(true);
    });
    return () => { alive = false; };
  }, [init.id]);

  const save = async (n = notes) => {
    if (!title.trim() || bad || !loaded) return;
    await savePlan({ id: init.id, title: title.trim(), notes: n, date, start, end });
  };
  const submit = async () => { await save(); close(); };
  // Moving the start keeps the length
  const moveStart = (v: string) => {
    if (!checkRange(start, end) && /^\d\d:\d\d$/.test(v)) setEnd(fromMin(Math.min(toMin(v) + (toMin(end) - toMin(start)), 1439)));
    setStart(v);
  };
  const dur = !bad ? toMin(end) - toMin(start) : null;

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", !inDialog && "bg-bg")}>
      {!inDialog && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-[15px] font-semibold">{editing ? t("planEdit") : t("planNew")}</h2>
          <button onClick={close} className="text-[13px] text-muted">{t("cancel")}</button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className={inDialog ? "space-y-4" : "min-h-0 flex-1 space-y-4 overflow-y-auto p-4"}>
        <input
          data-plantitle
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (editing) void save(); }}
          placeholder={t("planTitleHint")}
          aria-label={t("title")}
          className="w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-faint"
        />
        <NotesEditor value={notes} onChange={setNotes} onCommit={(v) => { setNotes(v); if (editing) void save(v); }} placeholder={t("addNote")} label={t("note")} />
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
        <div className="flex gap-2">
          {editing && (
            <Button type="button" variant="danger" className="h-10 gap-1.5 px-3" aria-label={t("delete")} onClick={() => { void deletePlan(init.id!); close(); }}><Trash2 size={15} /></Button>
          )}
          <Button type="submit" variant="primary" disabled={!title.trim() || !!bad || !loaded} className="h-10 flex-1 text-[14px]">{editing ? t("planSave") : t("add")}</Button>
        </div>
      </form>
    </div>
  );
}
