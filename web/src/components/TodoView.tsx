import { useMemo } from "react";
import { useItems, useNow, useT } from "../lib/app";
import { todayStr } from "../lib/dates";
import { type Group, compareTasks, groupOf, isOpen } from "../lib/tasks";
import { TaskRow } from "./TaskRow";
import { Empty, PageHeader } from "./ui";

const GROUP_ORDER: Group[] = ["overdue", "today", "tomorrow", "later", "noDate"];

/** The one Todo list: open tasks ordered by deadline. */
export function TodoView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null, focus?: "notes") => void }) {
  const t = useT();
  const today = todayStr(useNow());
  const tasks = useItems("task");
  const open = useMemo(() => tasks.filter(isOpen).sort(compareTasks), [tasks]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("todoTab")} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        {open.length === 0 && <Empty>{t("noOpen")}</Empty>}
        {GROUP_ORDER.map((g) => {
          const items = open.filter((x) => groupOf(x, today) === g);
          if (!items.length) return null;
          return (
            <section key={g}>
              <h2 className="sticky top-0 z-10 bg-bg/95 px-4 pb-1 pt-3 text-xs font-medium text-muted backdrop-blur md:px-6">
                {t(g)} <span className="text-faint">{items.length}</span>
              </h2>
              {items.map((x) => <TaskRow key={x.id} task={x} selected={selectedId === x.id} onSelect={(f) => onSelect(x.id, f)} />)}
            </section>
          );
        })}
      </div>
    </div>
  );
}
