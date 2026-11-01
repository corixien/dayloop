import { useEffect } from "react";
import { useSettings } from "../lib/app";
import { isNative } from "../lib/native";
import { pomo, usePomo } from "../lib/pomoStore";
import { widgetPlugin } from "../lib/widget";

/** Minimal focus view: a black screen that fills with purple from the bottom as the timer runs. Back leaves it. */
export function Zen() {
  const settings = useSettings();
  const { state, left } = usePomo();
  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);
  useEffect(() => {
    if (!isNative()) return;
    void widgetPlugin().keepAwake({ on: true }).catch(() => {});
    return () => void widgetPlugin().keepAwake({ on: false }).catch(() => {});
  }, []);
  // timer ended (or was reset): leave
  useEffect(() => {
    if (state && state.status === "idle") history.back();
  }, [state?.status]);

  const total = state ? state.plannedSec * 1000 : 0;
  const frac = total ? Math.max(0, Math.min(1, 1 - left / total)) : 0;
  return (
    <div className="fixed inset-0 z-[100] bg-black" role="timer" aria-label="focus">
      <div className="absolute inset-x-0 bottom-0 bg-[#7b61ff]" style={{ height: `${frac * 100}%`, transition: "height 1s linear" }} />
    </div>
  );
}
