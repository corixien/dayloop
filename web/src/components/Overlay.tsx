import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useState } from "react";
import { local, syncClient, useHashRoute, useSettings, useT, useTheme } from "../lib/app";
import { getTracker, markSent, sendToTracker, trackerErrorKey } from "../lib/tracker";
import { closeOverlay, openInApp, overlayReady, useWidgetSync } from "../lib/widget";
import { pomo, usePomo } from "../lib/pomoStore";
import { AssistantPanel } from "./Assistant";
import { AlarmPopup } from "./AlarmPopup";
import { NewItem } from "./NewItem";
import { PlanEditor } from "./PlanEditor";
import { fmtDate } from "../lib/dates";
import { defaultEnd, nextStart } from "../lib/planLogic";
import { Sheet } from "./Sheet";
import { Button } from "./ui";
import { TaskDetail } from "./TaskDetail";

/**
 * Opened by the home screen widget in a translucent activity: the same bottom sheets as in the app,
 * floating over the home screen. Routes: /overlay/task/<id>, /overlay/new/<todo|done>.
 */
export function Overlay() {
  const [route] = useHashRoute();
  const settings = useSettings();
  useTheme(settings.theme);
  useWidgetSync();
  useEffect(() => {
    document.documentElement.classList.add("overlay");
    overlayReady();
    syncClient.start();
    void syncClient.syncNow();
  }, []);

  const [, , kind, arg] = route.split("/");
  if (kind === "task" && arg) {
    return (
      <Sheet always onClose={() => void closeOverlay()} onExpand={() => void local.get("task", arg).then((x) => openInApp(x?.done ? "/done" : "/todo"))}>
        {(close) => <TaskDetail id={arg} onClose={close} onFocus={(id) => void openInApp("/pomodoro", id)} />}
      </Sheet>
    );
  }
  if (kind === "focus") return <FocusPopup />;
  if (kind === "assistant") return <AssistantSheet />;
  if (kind === "alarm") return <AlarmPopup onClose={() => void closeOverlay()} />;
  if (kind === "track" && arg) return <TrackSend id={arg} />;
  if (kind === "plan") return <PlanOverlay id={arg} />;
  if (kind === "new" && arg === "plan") return <PlanOverlay />;
  if (kind === "new") return <NewItem kind={arg === "done" ? "done" : arg === "event" ? "event" : "todo"} bare onClose={() => void closeOverlay()} />;
  return null;
}

/** Widget paper plane: send one finished entry to the Productivity-Tracker, show the result briefly, close. */
function TrackSend({ id }: { id: string }) {
  const t = useT();
  const language = useSettings().language;
  const [msg, setMsg] = useState<{ text: string; err: boolean }>({ text: t("trackerSending"), err: false });
  useEffect(() => {
    let alive = true;
    (async () => {
      let out = { text: t("trackerErr"), err: true };
      const cfg = getTracker();
      const task = await local.get("task", id);
      if (!cfg) out = { text: t("trackerSetup"), err: true };
      else if (task) {
        try {
          const r = await sendToTracker(cfg, [{ title: task.title, notes: task.notes }], language);
          markSent([id]);
          out = { text: `${r.name} · +${r.xp} XP`, err: false };
        } catch (e) {
          out = { text: t(trackerErrorKey(e) as any), err: true };
        }
      }
      if (!alive) return;
      setMsg(out);
      setTimeout(() => void closeOverlay(), out.err ? 2200 : 1400);
    })();
    return () => { alive = false; };
  }, [id]);
  return (
    <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center px-6">
      <div role="status" className={`anim-fade-up max-w-full truncate rounded-full border border-line bg-raise px-4 py-2 text-[13px] font-medium shadow-lg ${msg.err ? "text-danger" : ""}`}>{msg.text}</div>
    </div>
  );
}

/** Tapping the live focus notification: a small pop-up with the running timer and its controls. */
function FocusPopup() {
  const t = useT();
  const settings = useSettings();
  const { state, left } = usePomo();
  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);
  const s = Math.ceil(left / 1000);
  const clock = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const label = !state ? "" : state.phase === "work" ? t("focus") : state.phase === "break" ? t("shortBreak") : t("longBreak");
  return (
    <Sheet always fit onClose={() => void closeOverlay()}>
      {(close) => (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-5 px-6 pb-8 pt-2">
          <div className="text-sm text-muted">{label}</div>
          <div className="text-[64px] font-semibold leading-none tracking-tight tabular-nums" role="timer">{clock}</div>
          <div className="flex items-center gap-2">
            <Button className="size-11 px-0" onClick={() => pomo.reset()} aria-label={t("reset")}><RotateCcw size={17} /></Button>
            {state?.status === "running"
              ? <Button variant="primary" className="h-11 px-7" onClick={() => pomo.pause()}><Pause size={17} /> {t("pause")}</Button>
              : <Button variant="primary" className="h-11 px-7" onClick={() => pomo.start()}><Play size={17} /> {state?.status === "paused" ? t("resume") : t("start")}</Button>}
            <Button className="size-11 px-0" onClick={() => pomo.skip()} aria-label={t("skip")}><SkipForward size={17} /></Button>
          </div>
          <button onClick={close} className="text-[13px] text-muted">{t("close")}</button>
        </div>
      )}
    </Sheet>
  );
}

/** Power-button assistant: a small sheet over whatever app was open, already listening. */
function AssistantSheet() {
  return (
    <Sheet always fit onClose={() => void closeOverlay()}>
      {() => <AssistantPanel autoStart />}
    </Sheet>
  );
}

/** Widget: edit a plan block (/overlay/plan/<id>) or create one for today at the next free time (/overlay/new/plan). */
function PlanOverlay({ id }: { id?: string }) {
  const [init, setInit] = useState<{ id?: string; date: string; start: string; end: string } | null>(null);
  useEffect(() => {
    void (async () => {
      const now = new Date();
      const date = fmtDate(now);
      if (id) {
        const x = await local.get("plan", id);
        if (x) return setInit({ id, date: x.date, start: x.start, end: x.end });
      }
      const today = (await local.all("plan")).filter((x) => x.date === date);
      const start = nextStart(today, now.getHours() * 60 + now.getMinutes());
      setInit({ date, start, end: defaultEnd(start) });
    })();
  }, [id]);
  return init ? <PlanEditor bare init={init} onClose={() => void closeOverlay()} onFocus={(min) => void openInApp("/pomodoro", undefined, min)} /> : null;
}
