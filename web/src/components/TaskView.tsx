import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { local, useItems, useNow, useT } from "../lib/app";
import { todayStr } from "../lib/dates";
import { type Group, type TaskItem, type View, compareTasks, deleteTaskForever, groupOf, matches } from "../lib/tasks";
import { Kanban } from "./Kanban";
import { ListDialog } from "./ListDialog";
import { QuickAdd } from "./QuickAdd";
import { TaskRow } from "./TaskRow";
import { Button, Empty, IconButton, PageHeader, Segmented } from "./ui";

const GROUPED = new Set(["today", "next7", "all"]);
const GROUP_ORDER: Group[] = ["overdue", "today", "tomorrow", "later", "noDate"];
const GROUP_KEY = { overdue: "overdue", today: "today", tomorrow: "tomorrow", later: "later", noDate: "noDate" } as const;

export function TaskView({ view, selectedId, onSelect }: { view: View; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const t = useT();
  const now = useNow();
  const today = todayStr(now);
  const tasks = useItems("task");
  const lists = useItems("list");
  const tagItems = useItems("tag");
  const tags = useMemo(() => new Map(tagItems.map((x) => [x.id, x])), [tagItems]);
  const listNames = useMemo(() => new Map(lists.map((x) => [x.id, x.name])), [lists]);
  const [edit, setEdit] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const list = view.kind === "list" ? lists.find((x) => x.id === view.id) : undefined;
  const tag = view.kind === "tag" ? tagItems.find((x) => x.id === view.id) : undefined;
  const title =
    view.kind === "smart" ? t(view.id) : view.kind === "list" ? list?.name ?? "" : `# ${tag?.name ?? ""}`;

  const visible = tasks.filter((x) => matches(x, view, today)).sort(compareTasks);
  const open = visible.filter((x) => !x.done);
  const done = visible.filter((x) => x.done);
  const isTrash = view.kind === "smart" && view.id === "trash";
  const canAdd = !(view.kind === "smart" && (view.id === "done" || view.id === "trash"));

  const row = (task: TaskItem, showList = view.kind !== "list") => (
    <TaskRow
      key={task.id} task={task} tags={tags} selected={selectedId === task.id} onSelect={() => onSelect(task.id)}
      listName={showList && task.listId ? listNames.get(task.listId) : undefined}
    />
  );

  async function setView(v: "list" | "kanban") {
    if (!list) return;
    const columns = list.columns.length ? list.columns : [{ id: crypto.randomUUID(), name: t("todo") }, { id: crypto.randomUUID(), name: t("done") }];
    await local.patch("list", list.id, { view: v, columns });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={title}>
        {list && (
          <Segmented
            value={list.view}
            onChange={(v) => void setView(v)}
            options={[{ value: "list", label: t("list_view") }, { value: "kanban", label: t("kanban") }]}
          />
        )}
        {(list || tag) && <IconButton label={t("edit")} onClick={() => setEdit(true)}><Pencil size={15} /></IconButton>}
        {isTrash && visible.length > 0 && (
          <Button variant="danger" onClick={() => { if (confirm(t("confirmDelete"))) visible.forEach((x) => void deleteTaskForever(x.id)); }}>
            <Trash2 size={14} /> {t("emptyTrash")}
          </Button>
        )}
      </PageHeader>
      {canAdd && list?.view !== "kanban" && <QuickAdd listId={list?.id ?? null} tagId={tag?.id} />}

      {list?.view === "kanban" ? (
        <div className="min-h-0 flex-1">
          <Kanban list={list} tasks={visible} tags={tags} selectedId={selectedId} onSelect={onSelect} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 && <Empty>{view.kind === "smart" && view.id === "today" ? t("allClear") : t("noTasks")}</Empty>}
          {view.kind === "smart" && GROUPED.has(view.id)
            ? GROUP_ORDER.map((g) => {
                const items = open.filter((x) => groupOf(x, today) === g);
                if (!items.length) return null;
                return (
                  <section key={g}>
                    <h2 className="sticky top-0 z-10 bg-bg/95 px-4 pb-1 pt-3 text-xs font-medium text-muted backdrop-blur md:px-6">
                      {t(GROUP_KEY[g])} <span className="text-faint">{items.length}</span>
                    </h2>
                    {items.map((x) => row(x))}
                  </section>
                );
              })
            : open.map((x) => row(x))}
          {isTrash && visible.map((x) => row(x))}
          {done.length > 0 && !isTrash && (
            <section>
              {view.kind !== "smart" && (
                <button onClick={() => setShowDone(!showDone)} className="flex w-full items-center gap-1 px-4 pb-1 pt-4 text-xs font-medium text-muted md:px-6">
                  {t("completed")} <span className="text-faint">{done.length}</span>
                </button>
              )}
              {(view.kind === "smart" || showDone) && done.map((x) => row(x))}
            </section>
          )}
        </div>
      )}
      {edit && (list || tag) && <ListDialog kind={list ? "list" : "tag"} item={(list ?? tag)!} onClose={() => setEdit(false)} onDeleted={() => onSelect(null)} />}
    </div>
  );
}

