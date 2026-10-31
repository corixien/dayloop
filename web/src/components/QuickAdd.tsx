import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useLang, useT } from "../lib/app";
import { fmtLong } from "../lib/dates";
import { parseQuickAdd } from "../lib/nlp";
import { addTask } from "../lib/tasks";

/** Single-line capture. Natural language fills date, time, priority, list and repeat. */
export function QuickAdd() {
  const t = useT();
  const lang = useLang();
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);

  async function submit() {
    if (!parsed || !parsed.title) return;
    await addTask({
      title: parsed.title,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority,
      notes: parsed.notes,
      repeat: parsed.repeat,
      reminders: parsed.dueDate && parsed.dueTime ? [{ offsetMin: 0 }] : [],
    });
    setText("");
  }

  return (
    <div className="border-b border-line px-4 py-2.5 md:px-6">
      <div className="flex items-center gap-2 rounded-ctl border border-line bg-raise px-2.5 focus-within:border-accent">
        <Plus size={16} className="shrink-0 text-faint" />
        <input
          data-quickadd
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void submit()}
          placeholder={t("addTask")}
          className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
        />
      </div>
      {parsed && (parsed.dueDate || parsed.priority || parsed.repeat || parsed.notes) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
          {parsed.dueDate && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{fmtLong(parsed.dueDate, lang)}{parsed.dueTime ? ` ${parsed.dueTime}` : ""}</span>}
          {parsed.repeat && <span className="rounded bg-sub px-1.5 py-0.5 ring-1 ring-line">{t(parsed.repeat.freq)}</span>}
          {parsed.priority > 0 && <span className="rounded bg-sub px-1.5 py-0.5 ring-1 ring-line">{[, t("pLow"), t("pMed"), t("pHigh")][parsed.priority]}</span>}
          {parsed.notes && <span className="max-w-full truncate rounded bg-sub px-1.5 py-0.5 ring-1 ring-line">{parsed.notes}</span>}
        </div>
      )}
    </div>
  );
}
