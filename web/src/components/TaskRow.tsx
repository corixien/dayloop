import { Bell, Check, ListChecks, Repeat, StickyNote, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useLang, useT } from "../lib/app";
import { addDays, fmtLong, todayStr } from "../lib/dates";
import { type TaskItem, toggleDone, trashTask } from "../lib/tasks";
import { Check_, cx } from "./ui";

export function dueLabel(t: TaskItem, lang: string, tr: (k: any) => string, today = todayStr()): { text: string; overdue: boolean } | null {
  if (!t.dueDate) return null;
  const time = t.dueTime ? ` ${t.dueTime}` : "";
  const overdue = t.dueDate < today && !t.done;
  let text: string;
  if (t.dueDate === today) text = tr("today");
  else if (t.dueDate === addDays(today, 1)) text = tr("tomorrow");
  else text = fmtLong(t.dueDate, lang);
  return { text: text + time, overdue };
}

const ACTION_AT = 96;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export function TaskRow({
  task, selected, listName, onSelect, draggable, onDragStart,
}: {
  task: TaskItem;
  selected: boolean;
  listName?: string;
  onSelect: (focus?: "notes") => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const t = useT();
  const lang = useLang();
  const due = dueLabel(task, lang, t);
  const subDone = task.subtasks.filter((s) => s.done).length;
  const noteLine = task.notes.trim().split("\n")[0];
  const [leaving, setLeaving] = useState(false);

  const content = useRef<HTMLDivElement>(null);
  const bgL = useRef<HTMLDivElement>(null);
  const bgR = useRef<HTMLDivElement>(null);
  const g = useRef({ x0: 0, y0: 0, dx: 0, mode: "idle" as "idle" | "swipe" | "scroll", moved: false });

  const setX = (dx: number, animate: boolean) => {
    if (content.current) {
      content.current.style.transition = animate ? `transform 240ms ${EASE}` : "none";
      content.current.style.transform = `translateX(${dx}px)`;
    }
    if (bgL.current) bgL.current.style.opacity = dx > 0 ? "1" : "0";
    if (bgR.current) bgR.current.style.opacity = dx < 0 ? "1" : "0";
  };

  /** Run an action after the row slid/collapsed out, so the list change feels continuous. */
  const finish = (action: () => void, dir: 1 | -1) => {
    setX(dir * (content.current?.offsetWidth ?? 400), true);
    setLeaving(true);
    setTimeout(action, 220);
  };

  const complete = () => finish(() => void toggleDone(task), 1);

  return (
    <div
      className="grid transition-[grid-template-rows,opacity] duration-200 ease-out"
      style={{ gridTemplateRows: leaving ? "0fr" : "1fr", opacity: leaving ? 0 : 1 }}
    >
      <div className="relative min-h-0 overflow-hidden">
        <div ref={bgL} className="absolute inset-0 flex items-center gap-2 bg-[#30a46c] pl-5 text-sm font-medium text-white opacity-0">
          <Check size={18} /> {task.done ? t("restore") : t("done")}
        </div>
        <div ref={bgR} className="absolute inset-0 flex items-center justify-end gap-2 bg-[#e5484d] pr-5 text-sm font-medium text-white opacity-0">
          {t("delete")} <Trash2 size={18} />
        </div>
        <div
          ref={content}
          role="button"
          tabIndex={0}
          draggable={draggable}
          onDragStart={onDragStart}
          onClick={() => { if (!g.current.moved) onSelect(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSelect();
            if (e.key === " " && e.target === e.currentTarget) { e.preventDefault(); complete(); }
          }}
          onTouchStart={(e) => {
            const tt = e.touches[0];
            Object.assign(g.current, { x0: tt.clientX, y0: tt.clientY, dx: 0, moved: false, mode: tt.clientX <= 30 ? "scroll" : "idle" });
          }}
          onTouchMove={(e) => {
            const s = g.current;
            if (s.mode === "scroll") return;
            const tt = e.touches[0];
            const dx = tt.clientX - s.x0, dy = tt.clientY - s.y0;
            if (s.mode === "idle") {
              if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
              s.mode = Math.abs(dx) > Math.abs(dy) * 1.4 ? "swipe" : "scroll";
            }
            if (s.mode !== "swipe") return;
            s.moved = true;
            // rubber band past the action point
            s.dx = Math.abs(dx) > ACTION_AT ? Math.sign(dx) * (ACTION_AT + (Math.abs(dx) - ACTION_AT) * 0.35) : dx;
            setX(s.dx, false);
          }}
          onTouchEnd={() => {
            const s = g.current;
            if (s.mode === "swipe") {
              if (s.dx >= ACTION_AT) complete();
              else if (s.dx <= -ACTION_AT) finish(() => void trashTask(task.id), -1);
              else setX(0, true);
            }
            s.mode = "idle";
            setTimeout(() => (s.moved = false), 50);
          }}
          onTouchCancel={() => { g.current.mode = "idle"; setX(0, true); }}
          className={cx(
            "relative touch-pan-y group flex min-h-12 cursor-default select-none items-start gap-3 border-b border-line/60 bg-bg px-4 py-2.5 md:min-h-10 md:px-6 md:py-2",
            selected ? "!bg-accent-soft" : "md:hover:bg-hover",
          )}
        >
          <div className="pt-0.5">
            <Check_ done={task.done} priority={task.priority} onChange={complete} label={task.title} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cx("truncate text-[15px] md:text-[14px]", task.done && "text-faint line-through")}>{task.title}</div>
            {noteLine && (
              <button
                onClick={(e) => { e.stopPropagation(); onSelect("notes"); }}
                className="mt-0.5 flex w-full items-center gap-1.5 text-left text-xs text-muted hover:text-fg"
                aria-label={t("note")}
              >
                <StickyNote size={12} className="shrink-0" />
                <span className="truncate">{noteLine}</span>
              </button>
            )}
            {(due || task.subtasks.length > 0 || task.repeat || listName) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
                {due && <span className={cx(due.overdue && "text-danger")}>{due.text}</span>}
                {task.repeat && <Repeat size={12} aria-label="repeat" />}
                {task.reminders.length > 0 && <Bell size={12} aria-label="reminder" />}
                {task.subtasks.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ListChecks size={12} />
                    {subDone}/{task.subtasks.length}
                  </span>
                )}
                {listName && <span className="text-faint">{listName}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
