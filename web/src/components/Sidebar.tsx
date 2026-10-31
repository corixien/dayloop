import { Calendar, CheckCheck, Flame, ListTodo, Search, Settings, Timer, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useItems, useNow, useSyncStatus, useT } from "../lib/app";
import { todayStr } from "../lib/dates";
import { doneDay, isDone, isOpen } from "../lib/tasks";
import { IconButton, cx } from "./ui";

function Item({ icon, label, to, route, count, onNavigate }: { icon: ReactNode; label: string; to: string; route: string; count?: number; onNavigate: () => void }) {
  return (
    <a
      href={`#${to}`}
      onClick={onNavigate}
      aria-current={route === to ? "page" : undefined}
      className={cx("flex h-9 items-center gap-2.5 rounded-ctl px-2.5 text-[13px]", route === to ? "bg-accent-soft font-medium text-accent" : "text-fg hover:bg-hover")}
    >
      <span className="grid size-4 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {!!count && <span className="text-xs text-muted">{count}</span>}
    </a>
  );
}

export function Sidebar({ route, onNavigate, onSearch }: { route: string; onNavigate: () => void; onSearch: () => void }) {
  const t = useT();
  const today = todayStr(useNow());
  const tasks = useItems("task");
  const status = useSyncStatus();
  const sz = 16;

  return (
    <nav className="flex h-full flex-col bg-sub safe-top" aria-label="Navigation">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <div className="flex items-center gap-2 pl-1.5 text-[15px] font-semibold tracking-tight">
          <img src="/icon.svg" alt="" className="size-5 rounded-[5px]" /> Dayloop
        </div>
        <IconButton label={t("search")} onClick={onSearch}><Search size={16} /></IconButton>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-2 pb-3">
        <div className="space-y-px">
          <Item to="/todo" route={route} label={t("todoTab")} icon={<ListTodo size={sz} />} count={tasks.filter(isOpen).length} onNavigate={onNavigate} />
          <Item to="/done" route={route} label={t("haveDone")} icon={<CheckCheck size={sz} />} count={tasks.filter((x) => isDone(x) && doneDay(x) === today).length} onNavigate={onNavigate} />
          <Item to="/calendar" route={route} label={t("calendar")} icon={<Calendar size={sz} />} onNavigate={onNavigate} />
          <Item to="/habits" route={route} label={t("habits")} icon={<Flame size={sz} />} onNavigate={onNavigate} />
          <Item to="/pomodoro" route={route} label={t("pomodoro")} icon={<Timer size={sz} />} onNavigate={onNavigate} />
        </div>
      </div>
      <div className="space-y-px border-t border-line p-2 safe-bottom">
        <Item to="/trash" route={route} label={t("trash")} icon={<Trash2 size={sz} />} onNavigate={onNavigate} />
        <Item to="/settings" route={route} label={t("settings")} icon={<Settings size={sz} />} onNavigate={onNavigate} />
        <div className="flex items-center gap-2 px-2.5 pt-1 text-[11px] text-muted" role="status">
          <span className={cx("size-1.5 rounded-full", status === "idle" ? "bg-green-500" : status === "syncing" ? "bg-amber-400" : status === "signedout" ? "bg-faint" : "bg-danger")} />
          {status === "idle" ? t("synced") : status === "syncing" ? t("syncing") : status === "offline" ? t("offline") : status === "error" ? t("syncError") : t("localOnly")}
        </div>
      </div>
    </nav>
  );
}
