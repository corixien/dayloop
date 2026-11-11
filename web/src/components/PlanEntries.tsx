import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../lib/app";
import { fuzzyScore } from "../lib/fuzzy";
import { stripMarks } from "../lib/notes";
import { addPoint, deletePoint, ensurePointIds, tickPoint, toggleTaskById, useTaskRefs } from "../lib/plan";
import type { EntryView } from "../lib/planLogic";
import { NewItem } from "./NewItem";
import { Check_, cx } from "./ui";

/** Todos of a plan block with their checklist points one level deeper. Ticking writes to the real todo. */
export function EntryTree({ views, onRemove, onAdded }: { views: EntryView[]; onRemove?: (taskId: string) => void; onAdded?: (taskId: string, pointId: string) => void }) {
  const t = useT();
  return (
    <ul className="space-y-1">
      {views.map((v) => (
        <li key={v.task.id}>
          <div className="group flex items-center gap-2">
            <Check_ done={v.task.done} priority={v.task.priority} size={18} label={stripMarks(v.task.title)} onChange={() => void toggleTaskById(v.task.id)} />
            <span className={cx("min-w-0 flex-1 truncate text-[14px] font-medium", v.task.done && "text-muted line-through")}>{stripMarks(v.task.title)}</span>
            {!v.task.done && <Marks priority={v.task.priority} />}
            {onRemove && <button type="button" aria-label={t("removeFromPlan")} onClick={() => onRemove(v.task.id)} className="grid size-6 place-items-center rounded text-muted hover:text-fg"><X size={14} /></button>}
          </div>
          {v.points.length > 0 && (
            <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-line pl-4">
              {v.points.map((p) => (
                <li key={p.id ?? p.index} className="flex items-center gap-2">
                  <Check_ done={p.done} size={15} label={p.text} onChange={() => void tickPoint(v.task.id, p, !p.done)} />
                  <span className={cx("min-w-0 flex-1 truncate text-[13px]", p.done && "text-muted line-through")}>{p.text}</span>
                  <button type="button" aria-label={`${t("planRemovePoint")}: ${p.text}`} onClick={() => void deletePoint(v.task.id, p)} className="grid size-5 place-items-center rounded text-faint hover:text-fg"><X size={12} /></button>
                </li>
              ))}
            </ul>
          )}
          <PointAdder taskId={v.task.id} nested={v.points.length > 0} onAdded={onAdded} />
        </li>
      ))}
    </ul>
  );
}

/** Priority as in the todo list: ring color and thickness, plus "!" marks. */
function PrioRing({ priority, size = 16 }: { priority: number; size?: number }) {
  const col = priority ? `var(--color-p${priority})` : "var(--faint)";
  return <span aria-hidden className="shrink-0 rounded-full" style={{ width: size, height: size, border: `${[1.5, 1.5, 2.5, 3.5][priority] ?? 1.5}px solid ${col}` }} />;
}
const Marks = ({ priority }: { priority: number }) => priority > 0
  ? <span className="shrink-0 font-bold tracking-tighter" style={{ color: `var(--color-p${priority})` }}>{"!".repeat(priority)}</span>
  : null;

/** Search the open todos (highest priority first) and add one to a block; a typed name that matches nothing opens the new-todo form. */
export function TodoPicker({ taken, onPick }: { taken: string[]; onPick: (taskId: string) => void }) {
  const t = useT();
  const refs = useTaskRefs();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useMemo(() => {
    const all = [...refs.values()].filter((x) => !x.done && x.trashedAt === null && !taken.includes(x.id));
    const scored = all.map((x) => ({ x, s: fuzzyScore(q, stripMarks(x.title)) })).filter((r) => r.s > 0);
    return scored.sort((a, b) => b.x.priority - a.x.priority || b.s - a.s || a.x.order - b.x.order).map((r) => r.x);
  }, [refs, q, taken]);
  const close = () => { setOpen(false); setQ(""); };

  // a tap or click anywhere else closes the picker (not while the new-todo form is up)
  useEffect(() => {
    if (!open || creating) return;
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc); };
  }, [open, creating]);

  const pick = async (id: string) => { await ensurePointIds(id); onPick(id); close(); };

  return (
    <>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex h-8 items-center gap-1.5 rounded-ctl border border-dashed border-line px-2.5 text-[13px] text-muted hover:text-fg"><Plus size={14} />{t("planAddTodo")}</button>
      ) : (
        <div ref={box} className="rounded-lg border border-line bg-raise p-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("planFindTodo")} aria-label={t("planFindTodo")} className="mb-1 h-8 w-full rounded-ctl bg-transparent px-2 text-[14px] outline-none" />
          <div className="max-h-56 overflow-y-auto overscroll-contain" data-noswipe>
            {list.length === 0 && !q.trim() && <p className="px-2 py-1 text-[13px] text-faint">{t("planNoTodos")}</p>}
            {list.map((x) => (
              <button key={x.id} type="button" onClick={() => void pick(x.id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[14px] hover:bg-accent-soft">
                <PrioRing priority={x.priority} />
                <span className="min-w-0 flex-1 truncate">{stripMarks(x.title)}</span>
                <Marks priority={x.priority} />
              </button>
            ))}
          </div>
          {q.trim() && (
            <button type="button" onClick={() => setCreating(true)} className="flex w-full items-center gap-1.5 truncate rounded px-2 py-1.5 text-left text-[14px] text-accent hover:bg-accent-soft"><Plus size={14} />{t("planNewTodo")}: {q.trim()}</button>
          )}
          <button type="button" onClick={close} className="mt-1 px-2 text-[12px] text-muted">{t("cancel")}</button>
        </div>
      )}
      {creating && createPortal(
        // React events bubble through portals: keep the inner form's submit away from the plan editor's own form
        <div onSubmit={(e) => e.stopPropagation()}>
          <NewItem kind="todo" init={{ title: q.trim() }} onClose={() => setCreating(false)} onCreated={(id) => void pick(id)} />
        </div>,
        document.body,
      )}
    </>
  );
}

/** "+ Punkt": adds a checklist point to the real todo. */
function PointAdder({ taskId, nested, onAdded }: { taskId: string; nested: boolean; onAdded?: (taskId: string, pointId: string) => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const add = async () => {
    const id = await addPoint(taskId, text);
    setText("");
    if (id) onAdded?.(taskId, id);
  };
  return (
    <div className={cx("mt-0.5 flex items-center gap-2", nested ? "ml-3 border-l border-line pl-4" : "ml-3 pl-4")}>
      <Plus size={13} className="shrink-0 text-faint" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
        placeholder={t("planAddPoint")}
        aria-label={t("planAddPoint")}
        className="h-6 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint"
      />
    </div>
  );
}
