import { Plus, X } from "lucide-react";
import { useState } from "react";
import { local, uid, useT } from "../lib/app";
import type { Item } from "../lib/db";
import { type TaskItem, addTask, compareTasks } from "../lib/tasks";
import { TaskRow } from "./TaskRow";
import { IconButton, cx } from "./ui";

export function Kanban({
  list, tasks, tags, selectedId, onSelect,
}: { list: Item<"list">; tasks: TaskItem[]; tags: Map<string, Item<"tag">>; selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  const columns = list.columns;
  const [over, setOver] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const colOf = (task: TaskItem) => (columns.some((c) => c.id === task.columnId) ? task.columnId! : columns[0]?.id);

  const setColumns = (cols: typeof columns) => local.patch("list", list.id, { columns: cols });

  return (
    <div className="flex h-full gap-3 overflow-x-auto p-4 md:p-6">
      {columns.map((c) => {
        const items = tasks.filter((x) => colOf(x) === c.id).sort(compareTasks);
        return (
          <section
            key={c.id}
            onDragOver={(e) => { e.preventDefault(); setOver(c.id); }}
            onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/task");
              if (id) void local.patch("task", id, { columnId: c.id });
            }}
            className={cx("flex w-72 shrink-0 flex-col rounded-lg border bg-sub", over === c.id ? "border-accent" : "border-line")}
          >
            <div className="flex items-center justify-between px-3 py-2">
              <input
                defaultValue={c.name}
                aria-label={t("columnName")}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void setColumns(columns.map((x) => (x.id === c.id ? { ...x, name: e.target.value.trim() } : x)))}
                className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none"
              />
              <span className="mr-1 text-xs text-muted">{items.length}</span>
              {columns.length > 1 && <IconButton label={t("delete")} className="size-6" onClick={() => void setColumns(columns.filter((x) => x.id !== c.id))}><X size={13} /></IconButton>}
            </div>
            <div className="flex-1 space-y-px overflow-y-auto">
              {items.map((task) => (
                <div key={task.id} className="mx-1 overflow-hidden rounded-md border border-transparent bg-raise [&>div]:px-3">
                  <TaskRow
                    task={task} tags={tags} selected={selectedId === task.id} onSelect={() => onSelect(task.id)}
                    draggable onDragStart={(e) => e.dataTransfer.setData("text/task", task.id)}
                  />
                </div>
              ))}
            </div>
            <div className="p-2">
              <input
                value={draft[c.id] ?? ""}
                onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
                onKeyDown={(e) => {
                  const v = (draft[c.id] ?? "").trim();
                  if (e.key === "Enter" && v) {
                    void addTask({ title: v, listId: list.id, columnId: c.id });
                    setDraft({ ...draft, [c.id]: "" });
                  }
                }}
                placeholder={`+ ${t("newTask")}`}
                className="h-8 w-full rounded-ctl bg-transparent px-2 text-[13px] placeholder:text-faint hover:bg-hover focus:bg-raise"
              />
            </div>
          </section>
        );
      })}
      <button
        onClick={() => void setColumns([...columns, { id: uid(), name: t("columnName") }])}
        className="flex h-10 w-56 shrink-0 items-center gap-2 rounded-lg border border-dashed border-line px-3 text-[13px] text-muted hover:bg-hover"
      >
        <Plus size={14} /> {t("addColumn")}
      </button>
    </div>
  );
}
