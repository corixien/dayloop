import { Calendar as CalIcon, CalendarClock, CheckCheck, Flame, ListTodo, Menu, Plus, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { adoptGroqKey, adoptTracker, pushTracker } from "./lib/groqKey";
import { TRACKER_EVENT } from "./lib/tracker";
import { flushUploads, migrateMotivation } from "./lib/motivation";
import { syncClient, useHashRoute, useIsMobile, useSettings, useSyncStatus, useT, useTheme } from "./lib/app";
import { pomo, usePomo } from "./lib/pomoStore";
import { isNative } from "./lib/native";
import { takeOpenRequest, widgetPlugin } from "./lib/widget";
import { useReminders } from "./lib/useReminders";
import { useWidgetSync } from "./lib/widget";
import { AuthPanel } from "./components/AuthPanel";
import { Calendar } from "./components/Calendar";
import { CommandPalette } from "./components/CommandPalette";
import { AssistantPanel } from "./components/Assistant";
import { Motivation } from "./components/Motivation";
import { Habits } from "./components/Habits";
import { Trash } from "./components/Trash";
import { HaveDone } from "./components/HaveDone";
import { TodoView } from "./components/TodoView";
import { Pomodoro, fmtClock } from "./components/Pomodoro";
import { AlarmHost } from "./components/AlarmPopup";
import { Zen } from "./components/Zen";
import { Settings } from "./components/Settings";
import { Sidebar } from "./components/Sidebar";
import { Plan } from "./components/Plan";
import { TaskDetail } from "./components/TaskDetail";
import { Drawer } from "./components/Drawer";
import { usePlayer } from "./lib/player";
import { MiniPlayer } from "./components/MiniPlayer";
import { NewItem } from "./components/NewItem";
import { Sheet } from "./components/Sheet";
import { Button, Dialog, PageHeader, cx } from "./components/ui";

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
  useEffect(() => adoptGroqKey(settings.groqKey), [settings.groqKey]);
  useEffect(() => adoptTracker(settings), [settings.trackerUrl, settings.trackerUser, settings.trackerPass, settings.trackerSent.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = () => void pushTracker(); window.addEventListener(TRACKER_EVENT, f); return () => window.removeEventListener(TRACKER_EVENT, f); }, []);
  const status = useSyncStatus();
  useEffect(() => { void migrateMotivation(); }, []);
  useEffect(() => { if (status === "idle") void flushUploads(); }, [status]);
  const [route, go] = useHashRoute();
  const [selected, setSelected] = useState<string | null>(null);
  const [focusNotes, setFocusNotes] = useState(false);
  const mobile = useIsMobile();
  const [hl, setHl] = useState("");
  /** sub: a checklist item to point out in the opened task (calendar chips of ticked items) */
  const select = (id: string | null, focus?: "notes", sub?: string) => { setSelected(id); setFocusNotes(focus === "notes"); setHl(sub ?? ""); };
  const [drawer, setDrawer] = useState(false);
  const [chat, setChat] = useState(false);
  const [chatSeen, setChatSeen] = useState(false);
  useEffect(() => { if (chat) setChatSeen(true); }, [chat]);
  const [palette, setPalette] = useState(false);
  const [newKind, setNewKind] = useState<"todo" | "done" | null>(null);
  const player = usePlayer();
  const pageRef = useRef("todo");
  /** "+" / N: a todo, a Have Done entry, or (calendar) an appointment on the day in view */
  const add = () => {
    const p = pageRef.current;
    if (p === "calendar") window.dispatchEvent(new Event("dl-new-event"));
    else if (p === "plan") window.dispatchEvent(new Event("dl-new-plan"));
    else setNewKind(p === "done" ? "done" : "todo");
  };
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
      // tapped empty widget space: open the page the widget was showing
      if (isNative()) void widgetPlugin().takeRoute().then((x) => x.route && go(x.route)).catch(() => {});
      const r = takeOpenRequest();
      if (!r) return;
      if (r.focusTaskId) pomo.focusTask(r.focusTaskId);
      else if (r.focusMin) pomo.focusBlock(r.focusMin);
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
      else if (!typing && !e.metaKey && !e.ctrlKey && e.key === "n") { e.preventDefault(); add(); }
      else if (e.key === "Escape" && !typing) setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeWelcome = () => { localStorage.setItem("dl_welcomed", "1"); setWelcome(false); };
  const page = route.split("/")[1] || "todo";
  pageRef.current = page;
  const hasDetail = selected !== null && ["todo", "done", "calendar", "trash"].includes(page);

  const tabs = [
    { to: "/todo", icon: <ListTodo size={19} />, label: t("todoTab") },
    { to: "/done", icon: <CheckCheck size={19} />, label: t("haveDone") },
    { to: "/calendar", icon: <CalIcon size={19} />, label: t("calendar") },
    { to: "/plan", icon: <CalendarClock size={19} />, label: t("plan") },
    { to: "/habits", icon: <Flame size={19} />, label: t("tabHabits") },
  ];

  let main;
  if (page === "done") main = <HaveDone selectedId={selected} onSelect={select} />;
  else if (page === "calendar") main = <Calendar selectedId={selected} onSelect={(id, sub) => select(id, undefined, sub)} />;
  else if (page === "habits") main = <Habits />;
  else if (page === "pomodoro" || page === "zen") main = <Pomodoro />;
  else if (page === "assistant") main = <div className="flex h-full min-h-0 flex-col"><PageHeader title={t("assistant")} /><AssistantPanel /></div>;
  else if (page === "motivation") main = <Motivation />;
  else if (page === "plan") main = <Plan />;
  else if (page === "settings") main = <Settings />;
  else if (page === "trash") main = <Trash selectedId={selected} onSelect={select} />;
  else main = <TodoView selectedId={selected} onSelect={select} />;

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <div className="hidden w-[248px] shrink-0 border-r border-line md:block">
        <Sidebar route={route} onNavigate={() => {}} onSearch={() => setPalette(true)} />
      </div>
      <Drawer open={drawer} onOpenChange={setDrawer} blocked={chat} onOverpull={() => setPalette(true)}>
        <Sidebar route={route} onNavigate={() => setDrawer(false)} onSearch={() => { setDrawer(false); setPalette(true); }} />
      </Drawer>
      {route !== "/assistant" && (
        <Drawer side="right" open={chat} onOpenChange={setChat} blocked={drawer}>
          <div className="flex h-full min-h-0 flex-col bg-bg safe-top">
            <div className="flex h-12 shrink-0 items-center border-b border-line px-4 text-[15px] font-semibold">{t("assistant")}</div>
            {chatSeen && <AssistantPanel />}
          </div>
        </Drawer>
      )}

      <main className="relative flex min-w-0 flex-1 flex-col safe-top">
        <div key={page} className="anim-fade-up min-h-0 flex-1" onClick={hasDetail && !mobile ? (e) => {
          // click on empty space (not a row, button, field or the calendar grid) closes the side detail
          if (!(e.target as HTMLElement).closest("button,a,input,textarea,select,label,[role=button],[role=dialog],[role=menu],[data-notes],[data-keep]") && !window.getSelection()?.toString()) select(null);
        } : undefined}>{main}</div>
        <MiniPlayer />
        <nav className="grid shrink-0 grid-cols-6 border-t border-line bg-bg safe-bottom md:hidden" aria-label="Tabs">
          {tabs.map((x) => (
            <a key={x.to} href={`#${x.to}`} aria-current={route === x.to || route === (x as { also?: string }).also ? "page" : undefined}
              className={cx("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[10px]", route === x.to || route === (x as { also?: string }).also ? "font-bold text-accent after:absolute after:inset-x-3 after:top-0 after:h-[3px] after:rounded-b after:bg-accent" : "text-muted")}>
              {x.icon}{x.label}
            </a>
          ))}
          <button onClick={() => setDrawer(true)} className="flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"><Menu size={19} />{t("menu")}</button>
        </nav>
        {["todo", "done", "calendar", "plan"].includes(page) && (
          <button
            onClick={add}
            aria-label={page === "done" ? t("newDone") : page === "calendar" ? t("newEvent") : page === "plan" ? t("planNew") : t("newTask")}
            className={cx("group absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] right-4 z-20 grid size-14 place-items-center rounded-full bg-accent text-white shadow-lg shadow-black/25 transition-all duration-200 hover:scale-110 hover:shadow-xl hover:shadow-black/30 active:scale-95 md:bottom-6 md:right-6 dark:text-[#101012]", player.track && "mb-[3.6rem]")}
          >
            <Plus size={26} strokeWidth={2.2} className="transition-transform duration-200 group-hover:rotate-90" />
          </button>
        )}
      </main>

      {hasDetail && !mobile && (
        <div className="anim-fade w-[400px] shrink-0 border-l border-line">
          <TaskDetail id={selected!} focusNotes={focusNotes} highlight={hl} onClose={() => select(null)} onFocus={(id) => { pomo.focusTask(id); go("/pomodoro"); }} />
        </div>
      )}
      {hasDetail && mobile && (
        <Sheet onClose={() => select(null)}>
          {(close) => <TaskDetail id={selected!} focusNotes={focusNotes} highlight={hl} onClose={close} onFocus={(id) => { pomo.focusTask(id); go("/pomodoro"); select(null); }} />}
        </Sheet>
      )}

      {state?.status === "running" && page !== "pomodoro" && page !== "zen" && (
        <a href="#/pomodoro" className={cx("fixed left-4 z-20 flex items-center gap-2 rounded-full border border-line bg-raise px-3 py-1.5 text-[13px] font-medium tabular-nums shadow-lg", player.track ? "bottom-36 md:bottom-24" : "bottom-20 md:bottom-4")}>
          <Timer size={14} className="text-accent" /> {fmtClock(left)}
        </a>
      )}
      {page === "zen" && <Zen />}
      <AlarmHost />
      {newKind && <NewItem kind={newKind} onClose={() => setNewKind(null)} />}
      {palette && <CommandPalette onClose={() => setPalette(false)} onNew={(k) => { if (k === "event") { go("/calendar"); setTimeout(() => window.dispatchEvent(new Event("dl-new-event")), 250); } else setNewKind(k); }} onOpenTask={(id) => { if (!["todo", "done", "calendar", "trash"].includes(page)) go("/todo"); select(id); }} />}
      {welcome && <Welcome onClose={closeWelcome} />}
      {status === "error" && null}
    </div>
  );
}
