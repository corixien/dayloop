import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "../lib/app";
import { fuzzyScore } from "../lib/fuzzy";
import { stripMarks } from "../lib/notes";
import { ensurePointIds, tickPoint, toggleTaskById, useTaskRefs } from "../lib/plan";
import type { EntryView } from "../lib/planLogic";
import { Check_, cx } from "./ui";

/** Todos of a plan block with their checklist points one level deeper. Ticking writes to the real todo. */
export function EntryTree({ views, onRemove }: { views: EntryView[]; onRemove?: (taskId: string) => void }) {
  const t = useT();
  return (
    <ul className="space-y-1">
      {views.map((v) => (
        <li key={v.task.id}>
          <div className="group flex items-center gap-2">
            <Check_ done={v.task.done} size={18} label={stripMarks(v.task.title)} onChange={() => void toggleTaskById(v.task.id)} />
            <span className={cx("min-w-0 flex-1 truncate text-[14px] font-medium", v.task.done && "text-muted line-through")}>{stripMarks(v.task.title)}</span>
            {onRemove && <button type="button" aria-label={t("removeFromPlan")} onClick={() => onRemove(v.task.id)} className="grid size-6 place-items-center rounded text-muted hover:text-fg"><X size={14} /></button>}
          </div>
          {v.points.length > 0 && (
            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-line pl-4">
              {v.points.map((p) => (
                <li key={p.id ?? p.index} className="flex items-center gap-2">
                  <Check_ done={p.done} size={15} label={p.text} onChange={() => void tickPoint(v.task.id, p, !p.done)} />
                  <span className={cx("min-w-0 flex-1 truncate text-[13px]", p.done && "text-muted line-through")}>{p.text}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Search the open todos and add one to a block (all its points get ids first, so they can be addressed). */
export function TodoPicker({ taken, onPick }: { taken: string[]; onPick: (taskId: string) => void }) {
  const t = useT();
  const refs = useTaskRefs();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const all = [...refs.values()].filter((x) => !x.done && x.trashedAt === null && !taken.includes(x.id));
    return all.map((x) => ({ x, s: fuzzyScore(q, stripMarks(x.title)) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((r) => r.x);
  }, [refs, q, taken]);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex h-8 items-center gap-1.5 rounded-ctl border border-dashed border-line px-2.5 text-[13px] text-muted hover:text-fg"><Plus size={14} />{t("planAddTodo")}</button>;
  return (
    <div className="rounded-lg border border-line bg-raise p-2">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("planFindTodo")} aria-label={t("planFindTodo")} className="mb-1 h-8 w-full rounded-ctl bg-transparent px-2 text-[14px] outline-none" />
      {list.length === 0 && <p className="px-2 py-1 text-[13px] text-faint">{t("planNoTodos")}</p>}
      {list.map((x) => (
        <button key={x.id} type="button" onClick={async () => { await ensurePointIds(x.id); onPick(x.id); setQ(""); setOpen(false); }} className="block w-full truncate rounded px-2 py-1.5 text-left text-[14px] hover:bg-accent-soft">{stripMarks(x.title)}</button>
      ))}
      <button type="button" onClick={() => { setOpen(false); setQ(""); }} className="mt-1 px-2 text-[12px] text-muted">{t("cancel")}</button>
    </div>
  );
}
