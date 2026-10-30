import { EyeOff, LayoutGrid, List as ListIcon, Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { local, saveSettings, useItems, useNow, useSettings, useT } from "../lib/app";
import { todayStr } from "../lib/dates";
import { type Group, type TaskItem, type View, compareTasks, deleteTaskForever, groupOf, matches } from "../lib/tasks";
import { DateBoard, Kanban } from "./Kanban";
import { ListDialog } from "./ListDialog";
import { QuickAdd } from "./QuickAdd";
import { TaskRow } from "./TaskRow";
import { Button, Empty, IconButton, PageHeader } from "./ui";

const GROUPED = new Set(["today", "next7", "all"]);
const GROUP_ORDER: Group[] = ["overdue", "today", "tomorrow", "later", "noDate"];

export function TaskView({
  view, selectedId, onSelect, titleSlot,
}: { view: View; selectedId: string | null; onSelect: (id: string | null, focus?: "notes") => void; titleSlot?: ReactNode }) {
  const t = useT();
  const now = useNow();
  const today = todayStr(now);
  const settings = useSettings();
  const tasks = useItems("task");
  const lists = useItems("list");
  const listNames = useMemo(() => new Map(lists.map((x) => [x.id, x.name])), [lists]);
  const [edit, setEdit] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const boardKey = view.kind === "smart" ? `dl_board_${view.id}` : "";
  const [smartBoard, setSmartBoard] = useState(() => !!boardKey && localStorage.getItem(boardKey) === "1");

  const list = view.kind === "list" ? lists.find((x) => x.id === view.id) : undefined;
  const title = view.kind === "smart" ? t(view.id) : list?.name ?? "";

  const visible = tasks.filter((x) => matches(x, view, today)).sort(compareTasks);
  const open = visible.filter((x) => !x.done);
  const done = visible.filter((x) => x.done);
  const isTrash = view.kind === "smart" && view.id === "trash";
  const canBoard = !(view.kind === "smart" && (view.id === "done" || view.id === "trash"));
  const canAdd = canBoard;
  const board = list ? list.view === "kanban" : canBoard && smartBoard;
  const hideable = view.kind === "smart" && view.id !== "trash";

  const row = (task: TaskItem, showList = view.kind !== "list") => (
    <TaskRow
      key={task.id} task={task} selected={selectedId === task.id} onSelect={(f) => onSelect(task.id, f)}
      listName={showList && task.listId ? listNames.get(task.listId) : undefined}
    />
  );

  async function setMode(v: "list" | "kanban") {
    if (list) {
      const columns = list.columns.length ? list.columns : [{ id: crypto.randomUUID(), name: t("todo") }, { id: crypto.randomUUID(), name: t("done") }];
      await local.patch("list", list.id, { view: v, columns });
    } else {
      localStorage.setItem(boardKey, v === "kanban" ? "1" : "0");
      setSmartBoard(v === "kanban");
    }
  }

  async function hide() {
    if (view.kind !== "smart" || view.id === "trash") return;
    await saveSettings({ hiddenSmart: [...settings.hiddenSmart, view.id] });
    location.hash = "/todo";
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={titleSlot ?? title}>
        {canBoard && (
          <IconButton label={board ? t("list_view") : t("kanban")} onClick={() => void setMode(board ? "list" : "kanban")}>
            {board ? <ListIcon size={17} /> : <LayoutGrid size={17} />}
          </IconButton>
        )}
        {!titleSlot && list && <IconButton label={t("edit")} onClick={() => setEdit(true)}><Pencil size={15} /></IconButton>}
        {!titleSlot && hideable && <IconButton label={t("hide")} onClick={() => void hide()}><EyeOff size={15} /></IconButton>}
        {isTrash && visible.length > 0 && (
          <Button variant="danger" onClick={() => { if (confirm(t("confirmDelete"))) visible.forEach((x) => void deleteTaskForever(x.id)); }}>
            <Trash2 size={14} /> {t("emptyTrash")}
          </Button>
        )}
      </PageHeader>
      {canAdd && !(list && board) && <QuickAdd listId={list?.id ?? null} />}

      {board ? (
        <div className="min-h-0 flex-1">
          {list ? <Kanban list={list} tasks={visible} selectedId={selectedId} onSelect={onSelect} /> : <DateBoard tasks={visible} selectedId={selectedId} onSelect={onSelect} />}
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
                      {t(g)} <span className="text-faint">{items.length}</span>
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
      {edit && list && <ListDialog kind="list" item={list} onClose={() => setEdit(false)} onDeleted={() => onSelect(null)} />}
    </div>
  );
}
