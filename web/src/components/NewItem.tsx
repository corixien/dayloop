import { useEffect, useMemo, useState } from "react";
import type { Repeat } from "@dayloop/shared";
import { useIsMobile, useLang, useT } from "../lib/app";
import { fmtLong, todayStr } from "../lib/dates";
import { parseQuickAdd } from "../lib/nlp";
import { addDoneEntry, addTask } from "../lib/tasks";
import { NotesEditor } from "./NotesEditor";
import { Sheet } from "./Sheet";
import { Button, Dialog, Field, LeadField, Segmented, Select, cx, inputCls } from "./ui";

export type NewKind = "todo" | "done" | "event";
export interface NewInit { date?: string; time?: string | null }

/** The "+" flow: one form (sheet on phones, dialog on desktop) for a new todo, appointment or Have Done entry. */
export function NewItem({ kind, onClose, bare, init }: { kind: NewKind; onClose: () => void; bare?: boolean; init?: NewInit }) {
  const mobile = useIsMobile();
  if (bare || mobile) {
    return <Sheet always={bare} fit={bare} onClose={onClose}>{(close) => <Form kind={kind} init={init} close={close} />}</Sheet>;
  }
  return <DialogShell kind={kind} init={init} onClose={onClose} />;
}

const heading = (kind: NewKind, t: ReturnType<typeof useT>) => (kind === "todo" ? t("newTask") : kind === "event" ? t("newEvent") : t("newDone"));

function DialogShell({ kind, init, onClose }: { kind: NewKind; init?: NewInit; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title={heading(kind, t)} onClose={onClose} wide>
      <Form kind={kind} init={init} close={onClose} inDialog />
    </Dialog>
  );
}

function Form({ kind, init, close, inDialog }: { kind: NewKind; init?: NewInit; close: () => void; inDialog?: boolean }) {
  const t = useT();
  const lang = useLang();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(kind === "event" ? init?.date ?? todayStr() : "");
  const [time, setTime] = useState(init?.time ?? "");
  const [lead, setLead] = useState(1440);
  const [priority, setPriority] = useState(0);
  const [repeat, setRepeat] = useState<Repeat["freq"] | "">("");
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => (title.trim() ? parseQuickAdd(title) : null), [title]);
  useEffect(() => { document.querySelector<HTMLInputElement>("[data-newtitle]")?.focus(); }, []);

  async function save() {
    if (busy) return;
    const p = parseQuickAdd(title);
    if (!p.title) return;
    setBusy(true);
    const n = (notes.trim() || p.notes).trim();
    if (kind === "done") await addDoneEntry(p.title, n);
    else {
      const dueDate = date || p.dueDate;
      const when = time || p.dueTime;
      await addTask({
        title: p.title,
        notes: n,
        dueDate: dueDate || null,
        dueTime: dueDate ? when : null,
        priority: priority || p.priority,
        repeat: repeat ? { freq: repeat, interval: 1 } : p.repeat,
        reminders: dueDate && when ? [{ offsetMin: 0 }] : [],
        ...(kind === "event" ? { showBeforeMin: lead } : {}),
      });
    }
    close();
  }

  const chips: string[] = [];
  if (kind !== "done" && parsed) {
    if (parsed.dueDate && !date) chips.push(`${fmtLong(parsed.dueDate, lang)}${parsed.dueTime ? ` ${parsed.dueTime}` : ""}`);
    if (parsed.repeat && !repeat) chips.push(t(parsed.repeat.freq));
    if (parsed.priority && !priority) chips.push([, t("pLow"), t("pMed"), t("pHigh")][parsed.priority]!);
  }

  return (
    <div className={cx("flex min-h-0 flex-1 flex-col", !inDialog && "bg-bg")}>
      {!inDialog && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-[15px] font-semibold">{heading(kind, t)}</h2>
          <button onClick={close} className="text-[13px] text-muted">{t("cancel")}</button>
        </div>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); void save(); }}
        className={inDialog ? "space-y-4" : "min-h-0 flex-1 space-y-4 overflow-y-auto p-4"}
      >
        <div>
          <input
            data-newtitle
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "todo" ? t("addTask") : kind === "event" ? t("addEvent") : t("haveDoneAdd")}
            aria-label={t("title")}
            className="w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-faint"
          />
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              {chips.map((c) => <span key={c} className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{c}</span>)}
            </div>
          )}
        </div>
        <NotesEditor value={notes} onChange={setNotes} onCommit={setNotes} placeholder={t("addNote")} label={t("note")} />
        {kind !== "done" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("dueDate")}><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label={t("dueTime")}><input type="time" className={inputCls} disabled={!date && !parsed?.dueDate} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            </div>
            {kind === "event" && (
              <Field label={t("showInTodo")} group>
                <LeadField value={lead} onChange={setLead} t={t} />
                <p className="mt-1 text-[11px] text-faint">{t("apptHint")}</p>
              </Field>
            )}
            <Field label={t("priority")} group>
              <Segmented
                full
                value={priority}
                onChange={setPriority}
                options={[
                  { value: 0, label: t("pNone") },
                  { value: 1, label: t("pLow"), color: "var(--color-p1)" },
                  { value: 2, label: t("pMed"), color: "var(--color-p2)" },
                  { value: 3, label: t("pHigh"), color: "var(--color-p3)" },
                ]}
              />
            </Field>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">{t("repeat")}</span>
              <Select
                label={t("repeat")}
                value={repeat}
                options={[{ value: "", label: t("noRepeat") }, ...(["daily", "weekly", "monthly", "yearly"] as const).map((f) => ({ value: f as string, label: t(f) }))]}
                onChange={(v) => setRepeat(v as Repeat["freq"] | "")}
              />
            </div>
          </>
        )}
        <Button type="submit" variant="primary" disabled={!title.trim() || busy} className="h-10 w-full text-[14px]">
          {kind === "done" ? t("newDoneSave") : t("add")}
        </Button>
      </form>
    </div>
  );
}
