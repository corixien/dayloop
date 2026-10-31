import { useEffect, useMemo, useState } from "react";
import type { Repeat } from "@dayloop/shared";
import { useIsMobile, useLang, useT } from "../lib/app";
import { fmtLong } from "../lib/dates";
import { parseQuickAdd } from "../lib/nlp";
import { addDoneEntry, addTask } from "../lib/tasks";
import { Sheet } from "./Sheet";
import { Button, Dialog, Field, Segmented, Select, inputCls } from "./ui";

/** The "+" flow: one form (sheet on phones, dialog on desktop) for a new todo or a Have Done entry. */
export function NewItem({ kind, onClose, bare }: { kind: "todo" | "done"; onClose: () => void; bare?: boolean }) {
  const mobile = useIsMobile();
  if (bare || mobile) {
    return <Sheet always={bare} onClose={onClose}>{(close) => <Form kind={kind} close={close} />}</Sheet>;
  }
  return <DialogShell kind={kind} onClose={onClose} />;
}

function DialogShell({ kind, onClose }: { kind: "todo" | "done"; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title={kind === "todo" ? t("newTask") : t("newDone")} onClose={onClose} wide>
      <Form kind={kind} close={onClose} inDialog />
    </Dialog>
  );
}

function Form({ kind, close, inDialog }: { kind: "todo" | "done"; close: () => void; inDialog?: boolean }) {
  const t = useT();
  const lang = useLang();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
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
      await addTask({
        title: p.title,
        notes: n,
        dueDate: dueDate || null,
        dueTime: dueDate ? time || p.dueTime : null,
        priority: priority || p.priority,
        repeat: repeat ? { freq: repeat, interval: 1 } : p.repeat,
        reminders: dueDate && (time || p.dueTime) ? [{ offsetMin: 0 }] : [],
      });
    }
    close();
  }

  const chips: string[] = [];
  if (kind === "todo" && parsed) {
    if (parsed.dueDate && !date) chips.push(`${fmtLong(parsed.dueDate, lang)}${parsed.dueTime ? ` ${parsed.dueTime}` : ""}`);
    if (parsed.repeat && !repeat) chips.push(t(parsed.repeat.freq));
    if (parsed.priority && !priority) chips.push([, t("pLow"), t("pMed"), t("pHigh")][parsed.priority]!);
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      {!inDialog && (
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-[15px] font-semibold">{kind === "todo" ? t("newTask") : t("newDone")}</h2>
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
            placeholder={kind === "todo" ? t("addTask") : t("haveDoneAdd")}
            aria-label={t("title")}
            className="w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-faint"
          />
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              {chips.map((c) => <span key={c} className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{c}</span>)}
            </div>
          )}
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={t("addNote")}
          aria-label={t("note")}
          className="min-h-16 w-full resize-none rounded-ctl border border-line bg-raise p-2.5 text-[14px] placeholder:text-faint focus:border-accent"
        />
        {kind === "todo" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("dueDate")}><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label={t("dueTime")}><input type="time" className={inputCls} disabled={!date && !parsed?.dueDate} value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            </div>
            <Field label={t("priority")}>
              <Segmented
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
          {kind === "todo" ? t("add") : t("newDoneSave")}
        </Button>
      </form>
    </div>
  );
}
