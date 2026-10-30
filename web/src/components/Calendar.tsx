import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { local, useItems, useLang, useNow, useSettings, useT } from "../lib/app";
import { addDays, addMonths, fmtLong, fmtMonth, monthGrid, startOfWeek, timeToMin, todayStr, weekdayNames } from "../lib/dates";
import { occurrences } from "../lib/repeat";
import { useSwipe } from "../lib/swipe";
import { type TaskItem, addTask } from "../lib/tasks";
import { Button, Dialog, IconButton, PageHeader, Segmented, cx, inputCls } from "./ui";

type Mode = "month" | "week" | "day";
interface Ev {
  task: TaskItem;
  date: string;
}

const HOUR = 48;
const prioColor = (p: number) => (p === 3 ? "var(--color-p3)" : p === 2 ? "var(--color-p2)" : p === 1 ? "var(--color-p1)" : "var(--accent)");

function Chip({ ev, onSelect, selected }: { ev: Ev; onSelect: (id: string) => void; selected: boolean }) {
  return (
    <button
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task", ev.task.id)}
      onClick={(e) => { e.stopPropagation(); onSelect(ev.task.id); }}
      className={cx("flex w-full items-center gap-1 truncate rounded px-1.5 py-px text-left text-[11px] leading-5", selected ? "ring-1 ring-accent" : "", ev.task.done && "opacity-50 line-through")}
      style={{ background: `color-mix(in srgb, ${prioColor(ev.task.priority)} 14%, transparent)`, color: "var(--fg)", borderLeft: `2px solid ${prioColor(ev.task.priority)}` }}
    >
      {ev.task.dueTime && <span className="text-muted">{ev.task.dueTime}</span>}
      <span className="truncate">{ev.task.title}</span>
    </button>
  );
}

export function Calendar({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  const lang = useLang();
  const { weekStart } = useSettings();
  const now = useNow();
  const today = todayStr(now);
  const tasks = useItems("task");
  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 768 ? "day" : "month"));
  const [anchor, setAnchor] = useState(today);
  const [create, setCreate] = useState<{ date: string; time: string | null } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    if (mode === "month") return monthGrid(anchor, weekStart);
    if (mode === "week") { const s = startOfWeek(anchor, weekStart); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
    return [anchor];
  }, [mode, anchor, weekStart]);

  const events = useMemo(() => {
    const from = days[0], to = days[days.length - 1];
    const map = new Map<string, Ev[]>();
    const push = (task: TaskItem, date: string) => map.set(date, [...(map.get(date) ?? []), { task, date }]);
    for (const task of tasks) {
      if (!task.dueDate || task.trashedAt !== null) continue;
      if (task.repeat && !task.done) occurrences(task.dueDate, task.repeat, from, to).forEach((d) => push(task, d));
      else if (task.dueDate >= from && task.dueDate <= to) push(task, task.dueDate);
    }
    for (const v of map.values()) v.sort((a, b) => (a.task.dueTime ?? "").localeCompare(b.task.dueTime ?? ""));
    return map;
  }, [tasks, days]);

  useEffect(() => {
    if (mode !== "month" && scroller.current) scroller.current.scrollTop = 7 * HOUR;
  }, [mode]);

  const step = (dir: 1 | -1) => setAnchor(mode === "month" ? addMonths(anchor, dir) : addDays(anchor, dir * (mode === "week" ? 7 : 1)));
  useSwipe(() => body.current, { ignoreLeftEdge: 32, onLeft: () => step(1), onRight: () => step(-1) }, [mode, anchor]);
  const title = mode === "month" ? fmtMonth(anchor, lang) : mode === "day" ? fmtLong(anchor, lang) : `${fmtLong(days[0], lang)} – ${fmtLong(days[6], lang)}`;
  const names = weekdayNames(lang, weekStart);

  const drop = (e: React.DragEvent, date: string, time?: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task");
    if (id) void local.patch("task", id, time === undefined ? { dueDate: date } : { dueDate: date, dueTime: time });
  };

  const timeFromY = (e: React.MouseEvent | React.DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = Math.max(0, Math.min(23 * 60 + 45, Math.round(((e.clientY - r.top) / HOUR) * 4) * 15));
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={<span className="capitalize">{title}</span>}>
        <Button onClick={() => setAnchor(today)}>{t("today_btn")}</Button>
        <IconButton label="<" onClick={() => step(-1)}><ChevronLeft size={16} /></IconButton>
        <IconButton label=">" onClick={() => step(1)}><ChevronRight size={16} /></IconButton>
        <Segmented value={mode} onChange={setMode} options={[{ value: "month", label: t("month") }, { value: "week", label: t("week") }, { value: "day", label: t("day") }]} />
      </PageHeader>

      <div ref={body} className="flex min-h-0 flex-1 flex-col">
      {mode === "month" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-7 border-b border-line text-center text-xs text-muted">
            {names.map((n) => <div key={n} className="py-1.5">{n}</div>)}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
            {days.map((d) => {
              const evs = events.get(d) ?? [];
              return (
                <div
                  key={d}
                  onClick={() => setCreate({ date: d, time: null })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, d)}
                  className={cx("min-h-0 overflow-hidden border-b border-r border-line p-1", d.slice(0, 7) !== anchor.slice(0, 7) && "bg-sub/60")}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setAnchor(d); setMode("day"); }}
                    className={cx("mb-0.5 grid size-6 place-items-center rounded-full text-xs", d === today ? "bg-accent font-semibold text-white dark:text-[#101012]" : d.slice(0, 7) !== anchor.slice(0, 7) ? "text-faint" : "text-fg hover:bg-hover")}
                  >
                    {Number(d.slice(8))}
                  </button>
                  <div className="space-y-0.5">
                    {evs.slice(0, 3).map((ev) => <Chip key={ev.task.id} ev={ev} onSelect={onSelect} selected={selectedId === ev.task.id} />)}
                    {evs.length > 3 && <div className="px-1 text-[11px] text-muted">+{evs.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex border-b border-line pl-12">
            {days.map((d) => (
              <div key={d} className="flex-1 border-l border-line px-1 py-1.5">
                <div className={cx("text-center text-xs", d === today ? "font-semibold text-accent" : "text-muted")}>{fmtLong(d, lang)}</div>
                <div className="mt-1 min-h-6 space-y-0.5" onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d, null)} onClick={() => setCreate({ date: d, time: null })}>
                  {(events.get(d) ?? []).filter((e) => !e.task.dueTime).map((ev) => <Chip key={ev.task.id} ev={ev} onSelect={onSelect} selected={selectedId === ev.task.id} />)}
                </div>
              </div>
            ))}
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div className="relative flex" style={{ height: 24 * HOUR }}>
              <div className="w-12 shrink-0">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="pr-2 text-right text-[11px] text-faint" style={{ height: HOUR }}>{h > 0 && `${String(h).padStart(2, "0")}:00`}</div>
                ))}
              </div>
              {days.map((d) => {
                const evs = (events.get(d) ?? []).filter((e) => e.task.dueTime);
                return (
                  <div
                    key={d}
                    className="relative flex-1 border-l border-line"
                    style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, var(--line) ${HOUR - 1}px, var(--line) ${HOUR}px)` }}
                    onClick={(e) => setCreate({ date: d, time: timeFromY(e) })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => drop(e, d, timeFromY(e))}
                  >
                    {evs.map((ev, i) => {
                      const top = (timeToMin(ev.task.dueTime!) / 60) * HOUR;
                      const same = evs.slice(0, i).filter((o) => Math.abs(timeToMin(o.task.dueTime!) - timeToMin(ev.task.dueTime!)) < 30).length;
                      return (
                        <div key={ev.task.id} className="absolute px-0.5" style={{ top, height: HOUR / 2 + 4, left: `${same * 18}%`, right: 2 }}>
                          <Chip ev={ev} onSelect={onSelect} selected={selectedId === ev.task.id} />
                        </div>
                      );
                    })}
                    {d === today && (
                      <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-danger" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR }}>
                        <span className="absolute -left-1 -top-[3px] size-[7px] rounded-full bg-danger" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </div>
      {create && <CreateDialog {...create} onClose={() => setCreate(null)} />}
    </div>
  );
}

function CreateDialog({ date, time, onClose }: { date: string; time: string | null; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const [title, setTitle] = useState("");
  async function save() {
    if (!title.trim()) return;
    await addTask({ title: title.trim(), dueDate: date, dueTime: time, reminders: time ? [{ offsetMin: 0 }] : [] });
    onClose();
  }
  return (
    <Dialog title={`${t("newTask")} · ${fmtLong(date, lang)}${time ? ` ${time}` : ""}`} onClose={onClose}>
      <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} placeholder={t("title")} />
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button variant="primary" onClick={() => void save()}>{t("create")}</Button>
      </div>
    </Dialog>
  );
}
