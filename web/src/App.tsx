import { Calendar as CalIcon, CheckCheck, Flame, ListTodo, Menu, Plus, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { syncClient, useHashRoute, useIsMobile, useSettings, useSyncStatus, useT, useTheme } from "./lib/app";
import { pomo, usePomo } from "./lib/pomoStore";
import { takeOpenRequest } from "./lib/widget";
import { useReminders } from "./lib/useReminders";
import { useWidgetSync } from "./lib/widget";
import { AuthPanel } from "./components/AuthPanel";
import { Calendar } from "./components/Calendar";
import { CommandPalette } from "./components/CommandPalette";
import { Habits } from "./components/Habits";
import { Trash } from "./components/Trash";
import { HaveDone } from "./components/HaveDone";
import { TodoView } from "./components/TodoView";
import { Pomodoro, fmtClock } from "./components/Pomodoro";
import { Zen } from "./components/Zen";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { TaskDetail } from "./components/TaskDetail";
import { Drawer } from "./components/Drawer";
import { NewItem } from "./components/NewItem";
import { Sheet } from "./components/Sheet";
import { Button, Dialog, cx } from "./components/ui";

function Welcome({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title="Dayloop" onClose={onClose}>
      <AuthPanel onDone={onClose} />
      <Button variant="ghost" className="mt-3 w-full" onClick={onClose}>{t("useOffline")}</Button>
    </Dialog>
  );
}

export default function App() {
  const t = useT();
  const settings = useSettings();
  useTheme(settings.theme);
  const status = useSyncStatus();
  const [route, go] = useHashRoute();
  const [selected, setSelected] = useState<string | null>(null);
  const [focusNotes, setFocusNotes] = useState(false);
  const mobile = useIsMobile();
  const select = (id: string | null, focus?: "notes") => { setSelected(id); setFocusNotes(focus === "notes"); };
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [newKind, setNewKind] = useState<"todo" | "done" | null>(null);
  const [welcome, setWelcome] = useState(() => !localStorage.getItem("dl_welcomed") && !syncClient.session);
  const { state, left } = usePomo();
  useReminders();
  useWidgetSync();

  useEffect(() => { setSelected(null); }, [route]);

  useEffect(() => {
    document.documentElement.lang = settings.language;
  }, [settings.language]);

  useEffect(() => {
    syncClient.start();
    void syncClient.syncNow();
  }, []);

  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);
  // the widget overlay asks the app to open a screen (e.g. start focus on a task)
  useEffect(() => {
    const apply = () => {
      if (document.visibilityState !== "visible") return;
      const r = takeOpenRequest();
      if (!r) return;
      if (r.focusTaskId) pomo.focusTask(r.focusTaskId);
      go(r.route);
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => document.removeEventListener("visibilitychange", apply);
  }, []);

  useEffect(() => {
    document.title = state?.status === "running" ? `${fmtClock(left)} · Dayloop` : "Dayloop";
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key === "/") { e.preventDefault(); setPalette(true); }
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key === "n") { e.preventDefault(); setNewKind(page === "done" ? "done" : "todo"); }
      else if (e.key === "Escape" && !typing) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeWelcome = () => { localStorage.setItem("dl_welcomed", "1"); setWelcome(false); };
  const page = route.split("/")[1] || "todo";
  const hasDetail = selected !== null && ["todo", "done", "calendar", "trash"].includes(page);

  const tabs = [
    { to: "/todo", icon: <ListTodo size={19} />, label: t("todoTab") },
    { to: "/done", icon: <CheckCheck size={19} />, label: t("haveDone") },
    { to: "/calendar", icon: <CalIcon size={19} />, label: t("calendar") },
    { to: "/habits", icon: <Flame size={19} />, label: t("tabHabits") },
    { to: "/pomodoro", icon: <Timer size={19} />, label: t("pomodoro") },
  ];

  let main;
  if (page === "done") main = <HaveDone selectedId={selected} onSelect={select} />;
  else if (page === "calendar") main = <Calendar selectedId={selected} onSelect={select} />;
  else if (page === "habits") main = <Habits />;
  else if (page === "pomodoro" || page === "zen") main = <Pomodoro />;
  else if (page === "settings") main = <Settings />;
  else if (page === "trash") main = <Trash selectedId={selected} onSelect={select} />;
  else main = <TodoView selectedId={selected} onSelect={select} />;

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <div className="hidden w-[248px] shrink-0 border-r border-line md:block">
        <Sidebar route={route} onNavigate={() => {}} onSearch={() => setPalette(true)} />
      </div>
      <Drawer open={drawer} onOpenChange={setDrawer}>
        <Sidebar route={route} onNavigate={() => setDrawer(false)} onSearch={() => { setDrawer(false); setPalette(true); }} />
      </Drawer>

      <main className="relative flex min-w-0 flex-1 flex-col safe-top">
        <div key={page} className="anim-fade-up min-h-0 flex-1">{main}</div>
        <nav className="grid shrink-0 grid-cols-6 border-t border-line bg-bg safe-bottom md:hidden" aria-label="Tabs">
          {tabs.map((x) => (
            <a key={x.to} href={`#${x.to}`} aria-current={route === x.to || route === (x as { also?: string }).also ? "page" : undefined}
              className={cx("flex h-14 flex-col items-center justify-center gap-0.5 text-[10px]", route === x.to || route === (x as { also?: string }).also ? "text-accent" : "text-muted")}>
              {x.icon}{x.label}
            </a>
          ))}
          <button onClick={() => setDrawer(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"><Menu size={19} />{t("menu")}</button>
        </nav>
        {["todo", "done", "calendar"].includes(page) && (
          <button
            onClick={() => setNewKind(page === "done" ? "done" : "todo")}
            aria-label={page === "done" ? t("newDone") : t("newTask")}
            className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] right-4 z-20 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-black/25 transition-transform duration-200 active:scale-95 md:bottom-6 md:right-6 dark:text-[#101012]"
          >
            <Plus size={26} strokeWidth={2.2} />
          </button>
        )}
      </main>

      {hasDetail && !mobile && (
        <div className="anim-fade w-[400px] shrink-0 border-l border-line">
          <TaskDetail id={selected!} focusNotes={focusNotes} onClose={() => select(null)} onFocus={(id) => { pomo.focusTask(id); go("/pomodoro"); }} />
        </div>
      )}
      {hasDetail && mobile && (
        <Sheet onClose={() => select(null)}>
          {(close) => <TaskDetail id={selected!} focusNotes={focusNotes} onClose={close} onFocus={(id) => { pomo.focusTask(id); go("/pomodoro"); select(null); }} />}
        </Sheet>
      )}

      {state?.status === "running" && page !== "pomodoro" && page !== "zen" && (
        <a href="#/pomodoro" className="fixed bottom-20 left-4 z-20 flex items-center gap-2 rounded-full border border-line bg-raise px-3 py-1.5 text-[13px] font-medium tabular-nums shadow-lg md:bottom-4">
          <Timer size={14} className="text-accent" /> {fmtClock(left)}
        </a>
      )}
      {page === "zen" && <Zen />}
      {newKind && <NewItem kind={newKind} onClose={() => setNewKind(null)} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} onOpenTask={(id) => { if (!["todo", "done", "calendar", "trash"].includes(page)) go("/todo"); select(id); }} />}
      {welcome && <Welcome onClose={closeWelcome} />}
      {status === "error" && null}
    </div>
  );
}
