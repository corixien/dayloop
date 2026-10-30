import { useState } from "react";
import { useItems, useNow, useT } from "../lib/app";
import { todayStr } from "../lib/dates";
import { type Quadrant, moveToQuadrant, quadrantOf } from "../lib/tasks";
import { TaskRow } from "./TaskRow";
import { PageHeader, cx } from "./ui";

export function Matrix({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  const now = useNow();
  const today = todayStr(now);
  const tasks = useItems("task").filter((x) => !x.done && x.trashedAt === null);
  const [over, setOver] = useState<Quadrant | null>(null);
  const quads: { q: Quadrant; title: string; hint: string }[] = [
    { q: 1, title: t("q1"), hint: `${t("important")} · ${t("urgent")}` },
    { q: 2, title: t("q2"), hint: t("important") },
    { q: 3, title: t("q3"), hint: t("urgent") },
    { q: 4, title: t("q4"), hint: "" },
  ];
  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("matrix")} />
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 md:grid-rows-2 md:p-6">
        {quads.map(({ q, title, hint }) => {
          const items = tasks.filter((x) => quadrantOf(x, today) === q);
          return (
            <section
              key={q}
              onDragOver={(e) => { e.preventDefault(); setOver(q); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const task = tasks.find((x) => x.id === e.dataTransfer.getData("text/task"));
                if (task) void moveToQuadrant(task, q, today);
              }}
              className={cx("flex min-h-48 flex-col overflow-hidden rounded-lg border bg-sub", over === q ? "border-accent" : "border-line")}
            >
              <div className="flex items-baseline justify-between px-3 py-2">
                <h2 className="text-[13px] font-semibold">{title}</h2>
                <span className="text-xs text-muted">{hint}</span>
              </div>
              <div className="flex-1 overflow-y-auto bg-raise [&>div]:px-3">
                {items.map((task) => (
                  <TaskRow
                    key={task.id} task={task} selected={selectedId === task.id} onSelect={() => onSelect(task.id)}
                    draggable onDragStart={(e) => e.dataTransfer.setData("text/task", task.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
