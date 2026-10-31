import { Check, ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { local, useItems, useLang, useNow, useSettings, useT } from "../lib/app";
import { addDays, addMonths, fmtDate, fmtLong, fmtMonth, monthGrid, startOfWeek, timeToMin, todayStr, weekdayNames } from "../lib/dates";
import { doneItems } from "../lib/notes";
import { occurrences } from "../lib/repeat";
import { useSwipe } from "../lib/swipe";
import { type TaskItem, addTask, doneDay } from "../lib/tasks";
import { Button, Dialog, IconButton, PageHeader, Segmented, cx, inputCls } from "./ui";

type Mode = "month" | "week" | "day";
/** How a completion relates to the deadline: color coding of finished chips. */
type Timing = "early" | "on" | "late" | "none";
interface Ev {
  task: TaskItem;
  date: string;
  /** set for finished checklist items of a task */
  sub?: string;
  timing?: Timing;
}

const TIMING_COLOR: Record<Timing, string> = { early: "#30a46c", on: "var(--accent)", late: "#e5930b", none: "var(--faint)" };
const timingOf = (due: string | null, day: string): Timing => (!due ? "none" : day < due ? "early" : day === due ? "on" : "late");
const MODES = ["day", "week", "month"] as const;

const HOUR = 48;
const prioColor = (p: number) => (p === 3 ? "var(--color-p3)" : p === 2 ? "var(--color-p2)" : p === 1 ? "var(--color-p1)" : "var(--accent)");

function Chip({ ev, onSelect, selected }: { ev: Ev; onSelect: (id: string) => void; selected: boolean }) {
  return (
    <button
      draggable={!ev.task.done && !ev.sub}
      onDragStart={(e) => e.dataTransfer.setData("text/task", ev.task.id)}
      onClick={(e) => { e.stopPropagation(); onSelect(ev.task.id); }}
      className={cx("flex w-full items-center gap-1 truncate rounded px-1.5 py-px text-left text-[11px] leading-5", selected ? "ring-1 ring-accent" : "")}
      title={ev.sub ? `${ev.sub} · ${ev.task.title}` : ev.task.title}
      style={ev.timing
        ? { background: `color-mix(in srgb, ${TIMING_COLOR[ev.timing]} 16%, transparent)`, color: "var(--fg)", borderLeft: `2px solid ${TIMING_COLOR[ev.timing]}` }
        : { background: `color-mix(in srgb, ${prioColor(ev.task.priority)} 14%, transparent)`, color: "var(--fg)", borderLeft: `2px solid ${prioColor(ev.task.priority)}` }}
    >
      {ev.timing && (ev.sub ? <ListChecks size={10} className="shrink-0" style={{ color: TIMING_COLOR[ev.timing] }} /> : <Check size={10} className="shrink-0" style={{ color: TIMING_COLOR[ev.timing] }} />)}
      {!ev.timing && ev.task.dueTime && <span className="text-muted">{ev.task.dueTime}</span>}
      <span className={cx("truncate", ev.timing && "text-muted")}>{ev.sub ?? ev.task.title}</span>
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
  const [fx, setFx] = useState<"in-right" | "in-left" | "zoom-in" | "zoom-out">("in-right");
  const anim = `anim-${fx}`;
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
    const push = (task: TaskItem, date: string, extra: Partial<Ev> = {}) => map.set(date, [...(map.get(date) ?? []), { task, date, ...extra }]);
    for (const task of tasks) {
      if (task.trashedAt !== null) continue;
      // finished checklist items show up on the day they were ticked, whether or not the task itself is done
      for (const it of doneItems(task.notes)) {
        const d = fmtDate(new Date(it.at));
        if (d >= from && d <= to) push(task, d, { sub: it.text, timing: timingOf(task.dueDate, d) });
      }
      if (task.done) {
        // a finished task leaves its deadline and shows up on the day it was completed
        const d = doneDay(task);
        if (d >= from && d <= to) push(task, d, { timing: timingOf(task.dueDate, d) });
      } else if (task.dueDate) {
        if (task.repeat) occurrences(task.dueDate, task.repeat, from, to).forEach((d) => push(task, d));
        else if (task.dueDate >= from && task.dueDate <= to) push(task, task.dueDate);
      }
    }
    for (const v of map.values()) v.sort((a, b) => Number(!!a.timing) - Number(!!b.timing) || (a.task.dueTime ?? "").localeCompare(b.task.dueTime ?? ""));
    return map;
  }, [tasks, days]);

  useEffect(() => {
    if (mode !== "month" && scroller.current) scroller.current.scrollTop = 7 * HOUR;
  }, [mode]);

  const step = (d: 1 | -1) => {
    setFx(d > 0 ? "in-right" : "in-left");
    setAnchor(mode === "month" ? addMonths(anchor, d) : addDays(anchor, d * (mode === "week" ? 7 : 1)));
  };
  // pinch: spread = closer look (month > week > day), pinch together = wider view; the view follows the fingers
  const zoomTo = (dirIn: boolean, at?: string) => {
    const i = MODES.indexOf(mode) + (dirIn ? -1 : 1);
    if (i < 0 || i >= MODES.length) return false;
    setFx(dirIn ? "zoom-in" : "zoom-out");
    if (at) setAnchor(at);
    setMode(MODES[i]);
    return true;
  };
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    let d0 = 0, scale = 1, cx0 = 0, cy0 = 0;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const set = (s: number, animate: boolean) => {
      el.style.transition = animate ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
      el.style.transform = s === 1 ? "" : `scale(${s})`;
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      d0 = dist(e); scale = 1;
      cx0 = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      cy0 = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const r = el.getBoundingClientRect();
      el.style.transformOrigin = `${cx0 - r.left}px ${cy0 - r.top}px`;
    };
    const move = (e: TouchEvent) => {
      if (!d0 || e.touches.length !== 2) return;
      e.preventDefault();
      scale = Math.max(0.7, Math.min(1.5, dist(e) / d0));
      set(scale, false);
    };
    const end = () => {
      if (!d0) return;
      const s = scale;
      d0 = 0;
      const at = (document.elementFromPoint(cx0, cy0) as HTMLElement | null)?.closest<HTMLElement>("[data-date]")?.dataset.date;
      const dirIn = s > 1.22, out = s < 0.82;
      set(1, false);
      if (dirIn || out) zoomRef.current(dirIn, dirIn ? at : undefined);
      else { set(s, false); requestAnimationFrame(() => set(1, true)); }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, []);
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
      <PageHeader title={<span className="truncate text-lg capitalize md:text-[22px]">{title}</span>}>
        <IconButton label="<" onClick={() => step(-1)}><ChevronLeft size={18} /></IconButton>
        <Button onClick={() => { setFx("zoom-in"); setAnchor(today); }}>{t("today_btn")}</Button>
        <IconButton label=">" onClick={() => step(1)}><ChevronRight size={18} /></IconButton>
        <div className="max-md:hidden"><Segmented value={mode} onChange={setMode} options={[{ value: "month", label: t("month") }, { value: "week", label: t("week") }, { value: "day", label: t("day") }]} /></div>
      </PageHeader>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-1.5 md:hidden">
        <Segmented value={mode} onChange={(m) => { setFx(MODES.indexOf(m) < MODES.indexOf(mode) ? "zoom-in" : "zoom-out"); setMode(m); }} options={[{ value: "month", label: t("month") }, { value: "week", label: t("week") }, { value: "day", label: t("day") }]} />
        <Legend />
      </div>

      <div ref={body} className="flex min-h-0 flex-1 touch-pan-y flex-col will-change-transform">
      {mode === "month" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-7 border-b border-line text-center text-xs text-muted">
            {names.map((n) => <div key={n} className="py-1.5">{n}</div>)}
          </div>
          <div key={`m${anchor}`} className={`grid min-h-0 flex-1 grid-cols-7 grid-rows-6 ${anim}`}>
            {days.map((d) => {
              const evs = events.get(d) ?? [];
              return (
                <div
                  key={d}
                  data-date={d}
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
                    {evs.slice(0, 3).map((ev, i) => <Chip key={`${ev.task.id}${i}`} ev={ev} onSelect={onSelect} selected={selectedId === ev.task.id} />)}
                    {evs.length > 3 && <div className="px-1 text-[11px] text-muted">+{evs.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div key={`h${mode}${anchor}`} className={`flex border-b border-line pl-12 ${anim}`}>
            {days.map((d) => (
              <div key={d} data-date={d} className="flex-1 border-l border-line px-1 py-1.5">
                <div className={cx("text-center text-xs", d === today ? "font-semibold text-accent" : "text-muted")}>{fmtLong(d, lang)}</div>
                <div className="mt-1 min-h-6 space-y-0.5" onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d, null)} onClick={() => setCreate({ date: d, time: null })}>
                  {(events.get(d) ?? []).filter((e) => e.timing || !e.task.dueTime).map((ev, i) => <Chip key={`${ev.task.id}${i}`} ev={ev} onSelect={onSelect} selected={selectedId === ev.task.id} />)}
                </div>
              </div>
            ))}
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div key={`g${mode}${anchor}`} className={`relative flex ${anim}`} style={{ height: 24 * HOUR }}>
              <div className="w-12 shrink-0">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="pr-2 text-right text-[11px] text-faint" style={{ height: HOUR }}>{h > 0 && `${String(h).padStart(2, "0")}:00`}</div>
                ))}
              </div>
              {days.map((d) => {
                const evs = (events.get(d) ?? []).filter((e) => !e.timing && e.task.dueTime);
                return (
                  <div
                    key={d}
                    data-date={d}
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

function Legend() {
  const t = useT();
  const items: [Timing, string][] = [["early", t("calEarly")], ["on", t("calOn")], ["late", t("calLate")], ["none", t("calNoDue")]];
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-0.5 text-[10px] text-muted">
      {items.map(([k, label]) => (
        <span key={k} className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full" style={{ background: TIMING_COLOR[k] }} />{label}</span>
      ))}
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
