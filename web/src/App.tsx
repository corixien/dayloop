import { Calendar as CalIcon, Flame, ListTodo, Menu, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { syncClient, useHashRoute, useSettings, useSyncStatus, useT, useTheme } from "./lib/app";
import { pomo, usePomo } from "./lib/pomoStore";
import { useSwipe } from "./lib/swipe";
import { useReminders } from "./lib/useReminders";
import { useWidgetSync } from "./lib/widget";
import type { View } from "./lib/tasks";
import { AuthPanel } from "./components/AuthPanel";
import { Calendar } from "./components/Calendar";
import { CommandPalette } from "./components/CommandPalette";
import { Habits } from "./components/Habits";
import { Matrix } from "./components/Matrix";
import { Pomodoro, fmtClock } from "./components/Pomodoro";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { TaskDetail } from "./components/TaskDetail";
import { TaskView } from "./components/TaskView";
import { Button, Dialog, cx, inputCls } from "./components/ui";
import { useItems } from "./lib/app";

const SMART = ["inbox", "today", "next7", "all", "done", "trash"] as const;

function parseView(route: string): View | null {
  const [, a, b] = route.split("/");
  if ((SMART as readonly string[]).includes(a)) return { kind: "smart", id: a as (typeof SMART)[number] };
  if (a === "list" && b) return { kind: "list", id: b };
  return null;
}

function Welcome({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title="Dayloop" onClose={onClose}>
      <AuthPanel onDone={onClose} />
      <Button variant="ghost" className="mt-3 w-full" onClick={onClose}>{t("useOffline")}</Button>
    </Dialog>
  );
}

const SMART_ORDER = ["inbox", "today", "next7", "all", "done"] as const;

/** Mobile home: pick which list to look at from a dropdown in the header. */
function TodoPage({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const t = useT();
  const hidden = useSettings().hiddenSmart;
  const lists = useItems("list").filter((l) => !l.archived).sort((a, b) => a.order - b.order);
  const smart = SMART_ORDER.filter((k) => !hidden.includes(k));
  const [stored, setStored] = useState(() => localStorage.getItem("dl_todo") ?? "smart:today");
  const valid = (k: string) => (k.startsWith("smart:") ? smart.includes(k.slice(6) as (typeof SMART_ORDER)[number]) : lists.some((l) => l.id === k.slice(5)));
  const key = valid(stored) ? stored : smart.length ? `smart:${smart[0]}` : lists[0] ? `list:${lists[0].id}` : "smart:trash";
  const view: View = key.startsWith("smart:") ? { kind: "smart", id: key.slice(6) as never } : { kind: "list", id: key.slice(5) };
  const select = (
    <select
      aria-label={t("lists")}
      value={key}
      onChange={(e) => { localStorage.setItem("dl_todo", e.target.value); setStored(e.target.value); onSelect(null); }}
      className={cx(inputCls, "h-9 w-auto max-w-[70vw] border-transparent bg-transparent text-[15px] font-semibold")}
    >
      {smart.map((k) => <option key={k} value={`smart:${k}`}>{t(k)}</option>)}
      {lists.map((l) => <option key={l.id} value={`list:${l.id}`}>{l.name}</option>)}
    </select>
  );
  return <TaskView view={view} selectedId={selectedId} onSelect={onSelect} titleSlot={select} />;
}

export default function App() {
  const t = useT();
  const settings = useSettings();
  useTheme(settings.theme);
  const status = useSyncStatus();
  const [route, go] = useHashRoute();
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [welcome, setWelcome] = useState(() => !localStorage.getItem("dl_welcomed") && !syncClient.session);
  const { state, left } = usePomo();
  useSwipe(() => window, { fromLeftEdge: 32, threshold: 50, onRight: () => setDrawer(true), enabled: !drawer }, [drawer]);
  useReminders();
  useWidgetSync();

  useEffect(() => setSelected(null), [route]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  useEffect(() => {
    syncClient.start();
    void syncClient.syncNow();
  }, []);

  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);

  useEffect(() => {
    document.title = state?.status === "running" ? `${fmtClock(left)} · Dayloop` : "Dayloop";
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key === "/") { e.preventDefault(); setPalette(true); }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key === "n") { e.preventDefault(); document.querySelector<HTMLInputElement>("[data-quickadd]")?.focus(); }
      else if (e.key === "Escape" && !typing) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeWelcome = () => { localStorage.setItem("dl_welcomed", "1"); setWelcome(false); };
  const view = parseView(route);
  const page = route.split("/")[1];
  const hasDetail = selected !== null && page !== "settings" && page !== "pomodoro" && page !== "habits";

  const tabs = [
    { to: "/todo", icon: <ListTodo size={19} />, label: t("todoTab") },
    { to: "/calendar", icon: <CalIcon size={19} />, label: t("calendar") },
    { to: "/habits", icon: <Flame size={19} />, label: t("habits") },
    { to: "/pomodoro", icon: <Timer size={19} />, label: t("pomodoro") },
  ];

  let main;
  if (view) main = <TaskView view={view} selectedId={selected} onSelect={setSelected} />;
  else if (page === "todo") main = <TodoPage selectedId={selected} onSelect={setSelected} />;
  else if (page === "calendar") main = <Calendar selectedId={selected} onSelect={setSelected} />;
  else if (page === "habits") main = <Habits />;
  else if (page === "pomodoro") main = <Pomodoro />;
  else if (page === "matrix") main = <Matrix selectedId={selected} onSelect={setSelected} />;
  else if (page === "settings") main = <Settings />;
  else main = <TaskView view={{ kind: "smart", id: "today" }} selectedId={selected} onSelect={setSelected} />;

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <div className="hidden w-[248px] shrink-0 border-r border-line md:block">
        <Sidebar route={route} onNavigate={() => {}} onSearch={() => setPalette(true)} />
      </div>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="pop absolute inset-y-0 left-0 w-[280px] border-r border-line" onClick={(e) => e.stopPropagation()}>
            <Sidebar route={route} onNavigate={() => setDrawer(false)} onSearch={() => { setDrawer(false); setPalette(true); }} />
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col safe-top">
        <div className="min-h-0 flex-1">{main}</div>
        <nav className="grid shrink-0 grid-cols-5 border-t border-line bg-bg safe-bottom md:hidden" aria-label="Tabs">
          {tabs.map((x) => (
            <a key={x.to} href={`#${x.to}`} aria-current={route === x.to ? "page" : undefined}
              className={cx("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px]", route === x.to ? "text-accent" : "text-muted")}>
              {x.icon}{x.label}
            </a>
          ))}
          <button onClick={() => setDrawer(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"><Menu size={19} />{t("menu")}</button>
        </nav>
      </main>

      {hasDetail && (
        <div className="pop fixed inset-0 z-30 bg-bg safe-top md:static md:z-auto md:w-[400px] md:shrink-0 md:border-l md:border-line md:p-0">
          <TaskDetail id={selected!} onClose={() => setSelected(null)} onFocus={(id) => { pomo.focusTask(id); go("/pomodoro"); setSelected(null); }} />
        </div>
      )}

      {state?.status === "running" && page !== "pomodoro" && (
        <a href="#/pomodoro" className="fixed bottom-20 right-4 z-20 flex items-center gap-2 rounded-full border border-line bg-raise px-3 py-1.5 text-[13px] font-medium tabular-nums shadow-lg md:bottom-4">
          <Timer size={14} className="text-accent" /> {fmtClock(left)}
        </a>
      )}
      {palette && <CommandPalette onClose={() => setPalette(false)} onOpenTask={(id) => { if (!view && page !== "calendar" && page !== "matrix") go("/all"); setSelected(id); }} />}
      {welcome && <Welcome onClose={closeWelcome} />}
      {status === "error" && null}
    </div>
  );
}
