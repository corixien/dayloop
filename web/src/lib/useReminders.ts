import { useEffect } from "react";
import { local, useSettings } from "./app";
import { todayStr } from "./dates";
import { notifyNow } from "./notify";
import { type Reminder, upcomingReminders } from "./reminders";
import { scheduleNative } from "./native";
import { habitCounts } from "./habits";

async function compute(horizonDays: number): Promise<Reminder[]> {
  const settings = (await local.all("settings"))[0];
  return upcomingReminders(await local.all("task"), await local.all("habit"), habitCounts(await local.all("habitlog")), {
    now: Date.now(), horizonMs: horizonDays * 86_400_000, allDayHour: settings?.defaultReminderHour ?? 9, todayStr: todayStr(),
  });
}

const FIRED = "dl_fired";

/** Web: fire due reminders while the app is open. Native: keep the OS-level schedule in sync (works when closed). */
export function useReminders() {
  const settings = useSettings();
  useEffect(() => {
    let stop = false;
    let rescheduleTimer: ReturnType<typeof setTimeout>;
    const reschedule = () => {
      clearTimeout(rescheduleTimer);
      rescheduleTimer = setTimeout(async () => void scheduleNative(await compute(14), settings.language), 1500);
    };
    const sub = local.db.items.hook("creating", reschedule);
    local.db.items.hook("updating", reschedule);
    reschedule();

    const loop = setInterval(async () => {
      if (stop) return;
      const fired: string[] = JSON.parse(localStorage.getItem(FIRED) ?? "[]");
      const now = Date.now();
      const all = await compute(0.001); // next ~90s
      for (const r of all) {
        if (!fired.includes(r.key) && r.at - now < 30_000) {
          fired.push(r.key);
          notifyNow(r.title, r.body);
        }
      }
      localStorage.setItem(FIRED, JSON.stringify(fired.slice(-200)));
    }, 20_000);
    return () => {
      stop = true;
      clearInterval(loop);
      clearTimeout(rescheduleTimer);
      local.db.items.hook("creating").unsubscribe(reschedule);
      local.db.items.hook("updating").unsubscribe(reschedule);
      void sub;
    };
  }, [settings.language]);
}
