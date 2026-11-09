import { useMemo } from "react";
import { useItems, useNow, useSettings, useT } from "../lib/app";
import { groupOpen, sortOpen } from "../lib/tasks";
import { TaskRow } from "./TaskRow";
import { Empty, PageHeader } from "./ui";

/** The one Todo list, no sections: what is due within 24 hours on top, then one section per priority (oldest first). */
export function TodoView({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null, focus?: "notes") => void }) {
  const t = useT();
  const hour = useSettings().defaultReminderHour;
  const minute = Math.floor(useNow().getTime() / 60_000);
  const tasks = useItems("task");
  const open = useMemo(() => sortOpen(tasks, minute * 60_000, hour), [tasks, minute, hour]);
  const groups = useMemo(() => groupOpen(open, minute * 60_000, hour), [open, minute, hour]);
  const label = (k: (typeof groups)[number]["key"]) => (k === "urgent" ? t("dueSoon") : k === 3 ? t("pHigh") : k === 2 ? t("pMed") : k === 1 ? t("pLow") : t("pNone"));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("todoTab")} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-24 pt-1">
        {open.length === 0 && <Empty>{t("noOpen")}</Empty>}
        {groups.map((g) => (
          <section key={g.key}>
            <div className="sticky top-0 z-10 bg-bg/95 px-4 pb-1 pt-3 backdrop-blur md:px-6">
              <h2 className="text-xs font-medium text-muted">{label(g.key)} <span className="text-faint">{g.tasks.length}</span></h2>
            </div>
            {g.tasks.map((x) => <TaskRow key={x.id} task={x} selected={selectedId === x.id} onSelect={(f) => onSelect(x.id, f)} />)}
          </section>
        ))}
      </div>
    </div>
  );
}
