import { Check, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { useItems, useLang, useNow, useSettings, useT } from "../lib/app";
import { addDays, fmtLong, todayStr } from "../lib/dates";
import { doneDay, isDone } from "../lib/tasks";
import { TrackerError, getTracker, markSent, sendToTracker, sentIds } from "../lib/tracker";
import { TaskRow } from "./TaskRow";
import { Empty, IconButton, PageHeader, cx } from "./ui";

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Everything that got done, newest day first. Completing a todo lands here; entries can also be typed directly. */
export function HaveDone({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null, focus?: "notes") => void }) {
  const t = useT();
  const lang = useLang();
  const language = useSettings().language;
  const today = todayStr(useNow());
  const tasks = useItems("task");
  const [status, setStatus] = useState<{ day: string; kind: "sending" | "ok" | "err"; msg: string } | null>(null);
  const [sent, setSent] = useState(sentIds);
  const tracker = getTracker();

  const days = useMemo(() => {
    const by = new Map<string, typeof tasks>();
    for (const x of tasks.filter(isDone)) by.set(doneDay(x), [...(by.get(doneDay(x)) ?? []), x]);
    return [...by.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([day, list]) => [day, list.sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))] as const);
  }, [tasks]);

  const label = (day: string) => (day === today ? t("today") : day === addDays(today, -1) ? t("yesterday") : fmtLong(day, lang));

  async function send(day: string, items: typeof tasks) {
    const cfg = getTracker();
    if (!cfg) return;
    setStatus({ day, kind: "sending", msg: t("trackerSending") });
    try {
      const r = await sendToTracker(cfg, items.map((i) => ({ title: i.title, notes: i.notes })), language);
      markSent(items.map((i) => i.id));
      setSent(sentIds());
      setStatus({ day, kind: "ok", msg: `${r.name} · ${r.duration} ${t("minutesShort")} · +${r.xp} XP` });
    } catch (e) {
      const code = e instanceof TrackerError ? e.code : "other";
      setStatus({ day, kind: "err", msg: code === "auth" ? t("trackerErrAuth") : code === "network" ? t("trackerErrNet") : code === "ai" ? t("trackerErrAi") : code === "rate" ? t("trackerErrRate") : t("trackerErr") });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("haveDone")} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        {days.length === 0 && <Empty>{t("noneDone")}</Empty>}
        {days.map(([day, items]) => {
          const unsent = items.filter((i) => !sent.has(i.id));
          const st = status?.day === day ? status : null;
          return (
            <section key={day}>
              <div className="sticky top-0 z-10 flex items-center justify-between bg-bg/95 px-4 pb-1 pt-3 backdrop-blur md:px-6">
                <h2 className="text-xs font-medium text-muted">
                  {label(day)} <span className="text-faint">{items.length}</span>
                </h2>
                <div className="flex items-center gap-2">
                  {st && <span role="status" className={cx("max-w-[60vw] truncate text-[11px]", st.kind === "err" ? "text-danger" : "text-muted")}>{st.msg}</span>}
                  {tracker ? (
                    unsent.length > 0 ? (
                      <IconButton label={t("sendTracker")} className="size-7" disabled={st?.kind === "sending"} onClick={() => void send(day, unsent)}>
                        <Send size={15} className={cx(st?.kind === "sending" && "animate-pulse")} />
                      </IconButton>
                    ) : (
                      <span title={t("trackerSentAll")} aria-label={t("trackerSentAll")} className="grid size-7 place-items-center text-muted"><Check size={15} /></span>
                    )
                  ) : null}
                </div>
              </div>
              {items.map((x) => (
                <TaskRow key={x.id} task={x} selected={selectedId === x.id} onSelect={(f) => onSelect(x.id, f)} meta={clock(x.completedAt ?? x.updatedAt)} />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
