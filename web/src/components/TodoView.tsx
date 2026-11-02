import { useMemo } from "react";
import { useItems, useNow, useSettings, useT } from "../lib/app";
import { sortOpen } from "../lib/tasks";
import { TaskRow } from "./TaskRow";
import { Empty, PageHeader } from "./ui";

/** The one Todo list, no sections: what is due within 24 hours on top, then by priority and deadline. */
export function TodoView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null, focus?: "notes") => void }) {
  const t = useT();
  const hour = useSettings().defaultReminderHour;
  const minute = Math.floor(useNow().getTime() / 60_000);
  const tasks = useItems("task");
  const open = useMemo(() => sortOpen(tasks, minute * 60_000, hour), [tasks, minute, hour]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("todoTab")} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-24 pt-1">
        {open.length === 0 && <Empty>{t("noOpen")}</Empty>}
        {open.map((x) => <TaskRow key={x.id} task={x} selected={selectedId === x.id} onSelect={(f) => onSelect(x.id, f)} />)}
      </div>
    </div>
  );
}
