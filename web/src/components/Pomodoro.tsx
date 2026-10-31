import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useItems, useNow, useSettings, useT } from "../lib/app";
import { addDays, fmtDate, todayStr, weekdayNames } from "../lib/dates";
import { type Phase } from "../lib/pomo";
import { pomo, usePomo } from "../lib/pomoStore";
import { Button, PageHeader, Segmented, Select, cx } from "./ui";

export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function Pomodoro() {
  const t = useT();
  const settings = useSettings();
  const now = useNow();
  const { state, left } = usePomo();
  const tasks = useItems("task").filter((x) => !x.done && x.trashedAt === null);
  const sessions = useItems("pomodoro");
  const today = todayStr(now);

  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);

  const stats = useMemo(() => {
    const byDay = new Map<string, number>();
    const byTask = new Map<string, number>();
    for (const s of sessions) {
      if (s.kind !== "work" || !s.completed) continue;
      const d = fmtDate(new Date(s.startedAt));
      byDay.set(d, (byDay.get(d) ?? 0) + s.actualSec / 60);
      if (s.taskId) byTask.set(s.taskId, (byTask.get(s.taskId) ?? 0) + 1);
    }
    const count = sessions.filter((s) => s.kind === "work" && s.completed && fmtDate(new Date(s.startedAt)) === today).length;
    return { byDay, byTask, count };
  }, [sessions, today]);

  if (!state) return null;
  const total = state.plannedSec * 1000;
  const frac = total ? 1 - left / total : 0;
  const R = 120, C = 2 * Math.PI * R;
  const label = state.phase === "work" ? t("focus") : state.phase === "break" ? t("shortBreak") : t("longBreak");
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const max = Math.max(30, ...days.map((d) => stats.byDay.get(d) ?? 0));
  const names = weekdayNames(useSettings().language, 1);
  const linked = tasks.find((x) => x.id === state.taskId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("pomodoro")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-8">
          <Segmented<Phase>
            value={state.phase}
            onChange={(p) => state.status === "idle" && pomo.setPhase(p)}
            options={[{ value: "work", label: t("focus") }, { value: "break", label: t("shortBreak") }, { value: "long", label: t("longBreak") }]}
          />
          <div className="relative grid size-[280px] place-items-center" role="timer" aria-label={label}>
            <svg viewBox="0 0 280 280" className="absolute inset-0 -rotate-90">
              <circle cx="140" cy="140" r={R} fill="none" stroke="var(--line)" strokeWidth="6" />
              <circle cx="140" cy="140" r={R} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: "stroke-dashoffset 250ms linear" }} />
            </svg>
            <div className="text-center">
              <div className="text-[56px] font-semibold leading-none tracking-tight tabular-nums">{fmtClock(left)}</div>
              <div className="mt-2 text-sm text-muted">{label}{state.round > 0 && state.phase === "work" ? ` · ${state.round}` : ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button className="size-10 px-0" onClick={() => pomo.reset()} aria-label={t("reset")} title={t("reset")}><RotateCcw size={16} /></Button>
            {state.status === "running" ? (
              <Button variant="primary" className="h-10 px-6" onClick={() => pomo.pause()}><Pause size={16} /> {t("pause")}</Button>
            ) : (
              <Button variant="primary" className="h-10 px-6" onClick={() => pomo.start()}><Play size={16} /> {state.status === "paused" ? t("resume") : t("start")}</Button>
            )}
            <Button className="size-10 px-0" onClick={() => pomo.skip()} aria-label={t("skip")} title={t("skip")}><SkipForward size={16} /></Button>
          </div>
          <div className="w-full max-w-xs">
            <Select
              label={t("noTaskLinked")}
              value={state.taskId ?? ""}
              options={[{ value: "", label: t("noTaskLinked") }, ...tasks.map((x) => ({ value: x.id, label: x.title }))]}
              onChange={(v) => pomo.setTask(v || null)}
            />
          </div>
          {linked && <p className="-mt-3 text-xs text-muted">{stats.byTask.get(linked.id) ?? 0} {t("sessions")}</p>}

          <div className="grid w-full grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-line bg-sub py-3">
              <div className="text-xl font-semibold tabular-nums">{stats.count}</div>
              <div className="text-[11px] text-muted">{t("sessionsToday")}</div>
            </div>
            <div className="rounded-lg border border-line bg-sub py-3">
              <div className="text-xl font-semibold tabular-nums">{Math.round(stats.byDay.get(today) ?? 0)} <span className="text-xs font-normal text-muted">{t("minutesShort")}</span></div>
              <div className="text-[11px] text-muted">{t("focusToday")}</div>
            </div>
          </div>
          <div className="w-full">
            <div className="mb-2 text-xs font-medium text-muted">{t("focusWeek")}</div>
            <div className="flex h-24 items-end gap-2">
              {days.map((d) => {
                const m = stats.byDay.get(d) ?? 0;
                return (
                  <div key={d} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end"><div className="w-full rounded-t bg-accent/80" style={{ height: `${(m / max) * 100}%`, minHeight: m ? 2 : 0 }} title={`${Math.round(m)} ${t("minutesShort")}`} /></div>
                    <span className={cx("text-[10px]", d === today ? "font-semibold text-fg" : "text-muted")}>{names[(new Date(d + "T00:00").getDay() + 6) % 7]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
