import { Calendar, CheckCircle2, ChevronDown, ChevronRight, Flame, FolderPlus, Grid2x2, Inbox, ListTodo, Plus, Search, Settings, Sun, Sunrise, Timer, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useItems, useNow, useSettings, useSyncStatus, useT } from "../lib/app";
import { todayStr } from "../lib/dates";
import { type View, matches } from "../lib/tasks";
import { ListDialog } from "./ListDialog";
import { IconButton, colorOf, cx } from "./ui";

export function routeOf(v: View) {
  return v.kind === "smart" ? `/${v.id}` : `/${v.kind}/${v.id}`;
}

function Item({ icon, label, to, route, count, onNavigate }: { icon: ReactNode; label: string; to: string; route: string; count?: number; onNavigate: () => void }) {
  return (
    <a
      href={`#${to}`}
      onClick={onNavigate}
      aria-current={route === to ? "page" : undefined}
      className={cx("flex h-8 items-center gap-2.5 rounded-ctl px-2.5 text-[13px]", route === to ? "bg-accent-soft font-medium text-accent" : "text-fg hover:bg-hover")}
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
  const lists = useItems("list").filter((l) => !l.archived).sort((a, b) => a.order - b.order);
  const folders = useItems("folder").sort((a, b) => a.order - b.order);
  const hidden = useSettings().hiddenSmart;
  const status = useSyncStatus();
  const [dialog, setDialog] = useState<null | { kind: "list" | "folder" }>(null);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const count = (v: View) => tasks.filter((x) => matches(x, v, today)).length;
  const sz = 15;

  const listLink = (l: (typeof lists)[number]) => (
    <Item key={l.id} to={`/list/${l.id}`} route={route} label={l.name} count={count({ kind: "list", id: l.id }) - tasks.filter((x) => x.listId === l.id && x.done && x.trashedAt === null).length}
      icon={<span className="size-2.5 rounded-[3px]" style={{ background: colorOf(l.color) }} />} onNavigate={onNavigate} />
  );

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
          {!hidden.includes("inbox") && <Item to="/inbox" route={route} label={t("inbox")} icon={<Inbox size={sz} />} count={count({ kind: "smart", id: "inbox" })} onNavigate={onNavigate} />}
          {!hidden.includes("today") && <Item to="/today" route={route} label={t("today")} icon={<Sun size={sz} />} count={count({ kind: "smart", id: "today" })} onNavigate={onNavigate} />}
          {!hidden.includes("next7") && <Item to="/next7" route={route} label={t("next7")} icon={<Sunrise size={sz} />} count={count({ kind: "smart", id: "next7" })} onNavigate={onNavigate} />}
          {!hidden.includes("all") && <Item to="/all" route={route} label={t("all")} icon={<ListTodo size={sz} />} count={count({ kind: "smart", id: "all" })} onNavigate={onNavigate} />}
          {!hidden.includes("done") && <Item to="/done" route={route} label={t("done")} icon={<CheckCircle2 size={sz} />} onNavigate={onNavigate} />}
        </div>
        <div className="space-y-px">
          <Item to="/calendar" route={route} label={t("calendar")} icon={<Calendar size={sz} />} onNavigate={onNavigate} />
          <Item to="/habits" route={route} label={t("habits")} icon={<Flame size={sz} />} onNavigate={onNavigate} />
          <Item to="/pomodoro" route={route} label={t("pomodoro")} icon={<Timer size={sz} />} onNavigate={onNavigate} />
          <Item to="/matrix" route={route} label={t("matrix")} icon={<Grid2x2 size={sz} />} onNavigate={onNavigate} />
        </div>

        <div>
          <div className="flex items-center justify-between px-2.5 pb-1 text-xs font-medium text-muted">
            {t("lists")}
            <span className="flex">
              <IconButton label={t("newFolder")} className="size-6" onClick={() => setDialog({ kind: "folder" })}><FolderPlus size={14} /></IconButton>
              <IconButton label={t("newList")} className="size-6" onClick={() => setDialog({ kind: "list" })}><Plus size={14} /></IconButton>
            </span>
          </div>
          <div className="space-y-px">
            {folders.map((f) => (
              <div key={f.id}>
                <button onClick={() => setClosed({ ...closed, [f.id]: !closed[f.id] })} className="flex h-7 w-full items-center gap-1.5 px-2 text-xs font-medium text-muted hover:text-fg">
                  {closed[f.id] ? <ChevronRight size={13} /> : <ChevronDown size={13} />} {f.name}
                </button>
                {!closed[f.id] && <div className="space-y-px pl-2">{lists.filter((l) => l.folderId === f.id).map(listLink)}</div>}
              </div>
            ))}
            {lists.filter((l) => !l.folderId || !folders.some((f) => f.id === l.folderId)).map(listLink)}
          </div>
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
      {dialog && <ListDialog kind={dialog.kind} onClose={() => setDialog(null)} />}
    </nav>
  );
}
