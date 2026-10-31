import { Play, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Repeat } from "@dayloop/shared";
import { local, uid, useItems, useLang, useT } from "../lib/app";
import { weekdayNames } from "../lib/dates";
import { deleteTaskForever, restoreTask, toggleDone, trashTask } from "../lib/tasks";
import { Button, Check_, Field, IconButton, Segmented, Select, cx, inputCls } from "./ui";

const REMINDER_OPTIONS = [
  { v: 0, k: "atDue" }, { v: 5, k: "before5" }, { v: 30, k: "before30" }, { v: 60, k: "before1h" }, { v: 1440, k: "before1d" },
] as const;

/** Edits are written on blur / change, not per keystroke, so sync does not churn. */
function useDraft<T>(value: T, commit: (v: T) => void): [T, (v: T) => void, () => void] {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return [draft, setDraft, () => draft !== value && commit(draft)];
}

export function TaskDetail({ id, onClose, onFocus, focusNotes }: { id: string; onClose: () => void; onFocus: (taskId: string) => void; focusNotes?: boolean }) {
  const t = useT();
  const lang = useLang();
  const tasks = useItems("task");
  const task = tasks.find((x) => x.id === id);
  const patch = (p: object) => local.patch("task", id, p as any);

  const [title, setTitle, commitTitle] = useDraft(task?.title ?? "", (v) => v.trim() && patch({ title: v.trim() }));
  const [notes, setNotes, commitNotes] = useDraft(task?.notes ?? "", (v) => patch({ notes: v }));
  const [newSub, setNewSub] = useState("");
  const notesEl = useRef<HTMLTextAreaElement>(null);
  const grow = () => { const el = notesEl.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 320)}px`; } };
  useEffect(() => { if (focusNotes) { const el = notesEl.current; el?.focus(); el?.setSelectionRange(el.value.length, el.value.length); } }, [id, focusNotes, !!task]);
  useEffect(() => { grow(); }, [notes]);

  if (!task) return null;
  const trashed = task.trashedAt !== null;
  const names = weekdayNames(lang, 1);
  const wdOrder = [1, 2, 3, 4, 5, 6, 0];
  const repeat = task.repeat;
  const setRepeat = (r: Repeat | null) => patch({ repeat: r });
  const freqOptions = [
    { value: "", label: t("noRepeat") },
    ...(["daily", "weekly", "monthly", "yearly"] as const).map((f) => ({ value: f as string, label: t(f) })),
  ];
  const reminderOptions = REMINDER_OPTIONS.filter((o) => !task.reminders.some((r) => r.offsetMin === o.v)).map((o) => ({ value: o.v, label: t(o.k) }));

  return (
    <aside className="flex h-full flex-col bg-bg">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-2 pl-1">
          <Check_ done={task.done} priority={task.priority} onChange={() => void toggleDone(task)} label={task.title} />
          <span className="text-xs text-muted">{task.done ? t("done") : ""}</span>
        </div>
        <div className="flex items-center">
          {trashed ? (
            <>
              <IconButton label={t("restore")} onClick={() => void restoreTask(id)}><RotateCcw size={16} /></IconButton>
              <IconButton label={t("deleteForever")} onClick={() => { void deleteTaskForever(id); onClose(); }}><Trash2 size={16} className="text-danger" /></IconButton>
            </>
          ) : (
            <>
              <IconButton label={t("startFocus")} onClick={() => onFocus(id)}><Play size={16} /></IconButton>
              <IconButton label={t("delete")} onClick={() => { void trashTask(id); onClose(); }}><Trash2 size={16} /></IconButton>
            </>
          )}
          <IconButton label={t("close")} onClick={onClose}><X size={16} /></IconButton>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label={t("title")}
          className="w-full bg-transparent text-lg font-semibold outline-none"
        />
        <textarea
          ref={notesEl}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitNotes}
          rows={2}
          placeholder={t("addNote")}
          aria-label={t("note")}
          className="min-h-16 w-full resize-none rounded-ctl border border-line bg-raise p-2.5 text-[14px] placeholder:text-faint focus:border-accent"
        />

        {!task.done && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("dueDate")}>
              <input type="date" className={inputCls} value={task.dueDate ?? ""} onChange={(e) => patch({ dueDate: e.target.value || null, dueTime: e.target.value ? task.dueTime : null })} />
            </Field>
            <Field label={t("dueTime")}>
              <input type="time" className={inputCls} disabled={!task.dueDate} value={task.dueTime ?? ""} onChange={(e) => patch({ dueTime: e.target.value || null })} />
            </Field>
          </div>
        )}

        <Field label={t("priority")}>
          <Segmented
            value={task.priority}
            onChange={(v) => patch({ priority: v })}
            options={[
              { value: 0, label: t("pNone") },
              { value: 1, label: t("pLow"), color: "var(--color-p1)" },
              { value: 2, label: t("pMed"), color: "var(--color-p2)" },
              { value: 3, label: t("pHigh"), color: "var(--color-p3)" },
            ]}
          />
        </Field>

        {!task.done && (
          <>
            <div className="block">
              <span className="mb-1 block text-xs font-medium text-muted">{t("repeat")}</span>
              <div className="space-y-2">
                <Select
                  label={t("repeat")}
                  value={repeat?.freq ?? ""}
                  options={freqOptions}
                  onChange={(v) => {
                    if (!v) return setRepeat(null);
                    const freq = v as Repeat["freq"];
                    setRepeat({ freq, interval: repeat?.interval ?? 1, byWeekday: freq === "weekly" ? repeat?.byWeekday : undefined, until: repeat?.until, fromCompletion: repeat?.fromCompletion });
                  }}
                />
                {repeat && (
                  <div className="space-y-2 rounded-ctl border border-line p-2.5">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className="text-muted">{t("every")}</span>
                      <input type="number" min={1} max={365} className={cx(inputCls, "w-16")} value={repeat.interval} onChange={(e) => setRepeat({ ...repeat, interval: Math.max(1, Number(e.target.value) || 1) })} />
                      <span className="text-muted">{t(({ daily: "intervalDays", weekly: "intervalWeeks", monthly: "intervalMonths", yearly: "intervalYears" } as const)[repeat.freq])}</span>
                    </div>
                    {repeat.freq === "weekly" && (
                      <div className="flex gap-1">
                        {wdOrder.map((d, i) => {
                          const on = repeat.byWeekday?.includes(d);
                          return (
                            <button
                              key={d}
                              onClick={() => {
                                const cur = new Set(repeat.byWeekday ?? []);
                                on ? cur.delete(d) : cur.add(d);
                                setRepeat({ ...repeat, byWeekday: cur.size ? [...cur].sort() : undefined });
                              }}
                              className={cx("h-8 flex-1 rounded text-xs ring-1", on ? "bg-accent-soft text-accent ring-accent" : "text-muted ring-line hover:bg-hover")}
                            >
                              {names[i]}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" checked={!!repeat.fromCompletion} onChange={(e) => setRepeat({ ...repeat, fromCompletion: e.target.checked })} />
                      {t("fromCompletion")}
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="block">
              <span className="mb-1 block text-xs font-medium text-muted">{t("reminders")}</span>
              <div className="space-y-1.5">
                {task.reminders.map((r, i) => (
                  <div key={i} className="flex items-center justify-between rounded-ctl border border-line px-2.5 py-1 text-[13px]">
                    {t(REMINDER_OPTIONS.find((o) => o.v === r.offsetMin)?.k ?? "atDue")}
                    <IconButton label={t("delete")} className="size-6" onClick={() => patch({ reminders: task.reminders.filter((_, j) => j !== i) })}><X size={13} /></IconButton>
                  </div>
                ))}
                {reminderOptions.length > 0 && (
                  <Select
                    label={t("addReminder")}
                    disabled={!task.dueDate}
                    value={-1}
                    placeholder={`+ ${t("addReminder")}`}
                    options={reminderOptions}
                    onChange={(v) => patch({ reminders: [...task.reminders, { offsetMin: v }] })}
                  />
                )}
              </div>
            </div>
          </>
        )}

        <Field label={t("subtasks")}>
          <div className="space-y-1">
            {task.subtasks.map((s) => (
              <div key={s.id} className="group flex items-center gap-2.5 py-0.5">
                <Check_ done={s.done} onChange={() => patch({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} label={s.title} />
                <input
                  defaultValue={s.title}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== s.title && patch({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value.trim() } : x)) })}
                  className={cx("min-w-0 flex-1 bg-transparent text-[13px] outline-none", s.done && "text-faint line-through")}
                />
                <IconButton label={t("delete")} className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => patch({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}><X size={13} /></IconButton>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Plus size={16} className="text-faint" />
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSub.trim()) {
                    void patch({ subtasks: [...task.subtasks, { id: uid(), title: newSub.trim(), done: false }] });
                    setNewSub("");
                  }
                }}
                placeholder={t("addSubtask")}
                className="h-7 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
              />
            </div>
          </div>
        </Field>

        {trashed && <Button variant="danger" onClick={() => { void deleteTaskForever(id); onClose(); }}>{t("deleteForever")}</Button>}
      </div>
    </aside>
  );
}
