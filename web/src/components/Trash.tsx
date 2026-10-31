import { Trash2 } from "lucide-react";
import { useItems, useT } from "../lib/app";
import { deleteTaskForever } from "../lib/tasks";
import { TaskRow } from "./TaskRow";
import { Button, Empty, PageHeader } from "./ui";

export function Trash({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const t = useT();
  const items = useItems("task").filter((x) => x.trashedAt !== null).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("trash")}>
        {items.length > 0 && (
          <Button variant="danger" onClick={() => { if (confirm(t("confirmDelete"))) items.forEach((x) => void deleteTaskForever(x.id)); }}>
            <Trash2 size={14} /> {t("emptyTrash")}
          </Button>
        )}
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 && <Empty>{t("noTasks")}</Empty>}
        {items.map((x) => <TaskRow key={x.id} task={x} selected={selectedId === x.id} onSelect={() => onSelect(x.id)} />)}
      </div>
    </div>
  );
}
