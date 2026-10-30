import { Bell, ListChecks, Repeat } from "lucide-react";
import { useLang, useT } from "../lib/app";
import { addDays, fmtLong, todayStr } from "../lib/dates";
import { type TaskItem, toggleDone } from "../lib/tasks";
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

export function TaskRow({
  task, selected, listName, onSelect, draggable, onDragStart,
}: {
  task: TaskItem;
  selected: boolean;
  listName?: string;
  onSelect: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const t = useT();
  const lang = useLang();
  const due = dueLabel(task, lang, t);
  const subDone = task.subtasks.filter((s) => s.done).length;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
        if (e.key === " " && e.target === e.currentTarget) {
          e.preventDefault();
          void toggleDone(task);
        }
      }}
      className={cx(
        "group flex min-h-10 cursor-default items-start gap-3 border-b border-line/60 px-4 py-2 md:px-6",
        selected ? "bg-accent-soft" : "hover:bg-hover",
      )}
    >
      <div className="pt-0.5">
        <Check_ done={task.done} priority={task.priority} onChange={() => void toggleDone(task)} label={task.title} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={cx("truncate text-[14px]", task.done && "text-faint line-through")}>{task.title}</div>
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
  );
}
