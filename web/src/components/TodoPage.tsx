import { Menu, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { saveSettings, useItems, useSettings, useT } from "../lib/app";
import type { View } from "../lib/tasks";
import { ListDialog } from "./ListDialog";
import { TaskView } from "./TaskView";
import { Button, Dialog, IconButton, cx } from "./ui";

type Smart = "today" | "all" | "inbox";
const SMART: Smart[] = ["today", "all", "inbox"];

interface Chip {
  key: string;
  label: string;
  view: View;
}

/** Phone home: one chip row to pick what to look at (Heute, Alle, Eingang, own lists). Long-press a chip to edit or hide it. */
export function TodoPage({
  selectedId, onSelect, openMenu,
}: { selectedId: string | null; onSelect: (id: string | null, focus?: "notes") => void; openMenu?: () => void }) {
  const t = useT();
  const settings = useSettings();
  const lists = useItems("list").filter((l) => !l.archived).sort((a, b) => a.order - b.order);
  const [stored, setStored] = useState(() => localStorage.getItem("dl_todo") ?? "smart:today");
  const [manage, setManage] = useState<Chip | null>(null);
  const [create, setCreate] = useState(false);
  const prev = useRef(0);
  const active = useRef<HTMLButtonElement>(null);

  const chips: Chip[] = [
    ...SMART.filter((k) => !settings.hiddenSmart.includes(k)).map((k) => ({ key: `smart:${k}`, label: t(k), view: { kind: "smart", id: k } as View })),
    ...lists.map((l) => ({ key: `list:${l.id}`, label: l.name, view: { kind: "list", id: l.id } as View })),
  ];
  const current = chips.find((c) => c.key === stored) ?? chips[0];
  const index = Math.max(0, chips.findIndex((c) => c === current));
  const dir = index >= prev.current ? "anim-in-right" : "anim-in-left";
  useEffect(() => { prev.current = index; }, [index]);
  useEffect(() => { active.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, [current?.key]);

  const pick = (c: Chip) => { localStorage.setItem("dl_todo", c.key); setStored(c.key); onSelect(null); };

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressed = useRef(false);

  const strip = (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {openMenu && <IconButton label={t("menu")} onClick={openMenu} className="-ml-2"><Menu size={18} /></IconButton>}
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1" role="tablist" aria-label={t("lists")}>
        {chips.map((c) => (
          <button
            key={c.key}
            ref={c === current ? active : undefined}
            role="tab"
            aria-selected={c === current}
            onClick={() => { if (!pressed.current) pick(c); }}
            onTouchStart={() => { pressed.current = false; timer.current = setTimeout(() => { pressed.current = true; navigator.vibrate?.(8); setManage(c); }, 480); }}
            onTouchEnd={() => clearTimeout(timer.current)}
            onTouchMove={() => clearTimeout(timer.current)}
            onContextMenu={(e) => { e.preventDefault(); setManage(c); }}
            className={cx(
              "h-8 shrink-0 select-none rounded-full px-3.5 text-[13px] font-medium transition-colors duration-200",
              c === current ? "bg-accent text-white dark:text-[#101012]" : "bg-sub text-muted ring-1 ring-line",
            )}
          >
            {c.label}
          </button>
        ))}
        <button onClick={() => setCreate(true)} aria-label={t("newList")} className="grid size-8 shrink-0 place-items-center rounded-full text-muted ring-1 ring-dashed ring-line">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div key={current?.key} className={dir + " h-full"}>
        {current ? (
          <TaskView view={current.view} selectedId={selectedId} onSelect={onSelect} titleSlot={strip} />
        ) : (
          <div className="p-6 text-sm text-muted">{strip}</div>
        )}
      </div>
      {manage && <ManageDialog chip={manage} onClose={() => setManage(null)} hidden={settings.hiddenSmart} />}
      {create && <ListDialog kind="list" onClose={() => setCreate(false)} />}
    </>
  );
}

function ManageDialog({ chip, onClose, hidden }: { chip: Chip; onClose: () => void; hidden: string[] }) {
  const t = useT();
  const lists = useItems("list");
  if (chip.view.kind === "list") {
    const l = lists.find((x) => x.id === (chip.view as { id: string }).id);
    return l ? <ListDialog kind="list" item={l} onClose={onClose} /> : null;
  }
  const id = chip.view.id as Smart;
  return (
    <Dialog title={chip.label} onClose={onClose}>
      <p className="mb-4 text-[13px] text-muted">{t("restoreHint")}</p>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button variant="primary" onClick={() => { void saveSettings({ hiddenSmart: [...hidden, id] as never }); localStorage.removeItem("dl_todo"); onClose(); }}>{t("hide")}</Button>
      </div>
    </Dialog>
  );
}
