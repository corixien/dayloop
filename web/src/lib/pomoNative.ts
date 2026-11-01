import { local } from "./app";
import { type Lang, translate } from "./i18n";
import { isNative } from "./native";
import { type PomoState, remaining } from "./pomo";
import { widgetPlugin } from "./widget";

const SOUND = "dl_sound";
export interface Sound { uri: string; title: string }

/** The focus-end sound is a device setting (the URIs belong to this phone), so it is not synced. */
export const getSound = (): Sound | null => {
  try { return JSON.parse(localStorage.getItem(SOUND) ?? "null"); } catch { return null; }
};
export const saveSound = (s: Sound | null) => (s ? localStorage.setItem(SOUND, JSON.stringify(s)) : localStorage.removeItem(SOUND));

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** Tell the Android side what the timer does: live notification with countdown, and the alarm at the end. */
export async function syncFocusNative(s: PomoState, lang: Lang) {
  if (!isNative()) return;
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  try {
    const task = s.taskId ? await local.get("task", s.taskId) : null;
    const work = s.phase === "work";
    await widgetPlugin().focusSync({
      status: s.status,
      endsAt: s.endsAt ?? 0,
      title: `${work ? t("focus") : s.phase === "break" ? t("shortBreak") : t("longBreak")}${s.status === "paused" ? ` · ${t("pausedLabel")}` : ""}`,
      text: task?.title ?? "",
      clock: clock(remaining(s, Date.now())),
      doneTitle: work ? t("focusDone") : t("breakDone"),
      doneText: work ? t("timeForBreak") : t("backToWork"),
      soundUri: getSound()?.uri ?? "",
    });
  } catch (e) {
    console.warn("focus native", e);
  }
}
