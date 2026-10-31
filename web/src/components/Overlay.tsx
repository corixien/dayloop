import { useEffect, useState } from "react";
import { local, syncClient, useHashRoute, useSettings, useT, useTheme } from "../lib/app";
import { getTracker, markSent, sendToTracker, trackerErrorKey } from "../lib/tracker";
import { pomo } from "../lib/pomoStore";
import { closeOverlay, overlayReady, useWidgetSync } from "../lib/widget";
import { NewItem } from "./NewItem";
import { Sheet } from "./Sheet";
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
      <Sheet always onClose={() => void closeOverlay()}>
        {(close) => <TaskDetail id={arg} onClose={close} onFocus={(id) => { pomo.focusTask(id); close(); }} />}
      </Sheet>
    );
  }
  if (kind === "track" && arg) return <TrackSend id={arg} />;
  if (kind === "new") return <NewItem kind={arg === "done" ? "done" : "todo"} bare onClose={() => void closeOverlay()} />;
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
