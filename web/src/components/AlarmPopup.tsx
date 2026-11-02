import { BellOff, Play, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isNative } from "../lib/native";
import { useSettings, useT } from "../lib/app";
import { pomo, usePomo } from "../lib/pomoStore";
import { widgetPlugin } from "../lib/widget";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

/** Polls the native end-of-timer alarm (it rings until stopped, also from its notification). */
export function useAlarmRinging(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      widgetPlugin().alarmRinging().then((r) => setOn(r.ringing)).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);
  return on;
}

export const stopAlarm = () => widgetPlugin().stopAlarm().catch(() => {});

/** The timer ended: big stop button plus the useful next steps. Closes itself once the alarm is silent. */
export function AlarmPopup({ onClose }: { onClose: () => void }) {
  const t = useT();
  const settings = useSettings();
  const { state } = usePomo();
  const ringing = useAlarmRinging();
  const seen = useRef(false);
  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);
  useEffect(() => {
    if (ringing) { seen.current = true; return; }
    // stopped elsewhere (notification), or opened when nothing rings
    const id = setTimeout(onClose, seen.current ? 300 : 2500);
    return () => clearTimeout(id);
  }, [ringing]); // eslint-disable-line react-hooks/exhaustive-deps

  const next = state?.phase ?? "break";
  const workDone = next !== "work";
  const nextLabel = next === "work" ? t("focus") : next === "break" ? t("shortBreak") : t("longBreak");
  const running = state?.status === "running";
  return (
    <Sheet always fit onClose={onClose}>
      {(close) => (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-4 px-6 pb-8 pt-1">
          <div className="text-center">
            <div className="text-2xl font-semibold">{workDone ? t("focusDone") : t("breakDone")}</div>
            <div className="mt-1 text-sm text-muted">{workDone ? t("timeForBreak") : t("backToWork")}</div>
          </div>
          <button
            onClick={() => { void stopAlarm(); }}
            className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-accent text-lg font-semibold text-white active:scale-[0.98] dark:text-[#101012]"
          >
            <BellOff size={24} /> {t("stopAlarm")}
          </button>
          {!running && (
            <Button className="h-12 w-full gap-2" onClick={() => { void stopAlarm(); pomo.start(); close(); }}>
              <Play size={17} /> {nextLabel} · {t("start")}
            </Button>
          )}
          <div className="flex w-full gap-2">
            <Button className="h-11 flex-1 gap-2" onClick={() => { void stopAlarm(); pomo.skip(); }}>
              <SkipForward size={16} /> {t("skip")}
            </Button>
            <Button className="h-11 flex-1" onClick={() => { void stopAlarm(); close(); }}>{t("close")}</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** In the running app: show the pop-up while the alarm rings. */
export function AlarmHost() {
  const ringing = useAlarmRinging();
  const [hidden, setHidden] = useState(false);
  useEffect(() => { if (!ringing) setHidden(false); }, [ringing]);
  if (!ringing || hidden) return null;
  return <div className="relative z-[120]"><AlarmPopup onClose={() => setHidden(true)} /></div>;
}
