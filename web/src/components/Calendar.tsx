import { Check, ChevronLeft, ChevronRight, Flame, ListChecks } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { local, useItems, useLang, useNow, useSettings, useT } from "../lib/app";
import { addDays, addMonths, fmtDate, fmtLong, fmtMonth, monthGrid, startOfWeek, timeToMin, todayStr, weekdayNames } from "../lib/dates";
import { habitCounts } from "../lib/habits";
import { doneItems } from "../lib/notes";
import { occurrences } from "../lib/repeat";
import { useSwipe } from "../lib/swipe";
import { type TaskItem, addTask, doneDay } from "../lib/tasks";
import { Button, Dialog, IconButton, PageHeader, Segmented, colorOf, cx, inputCls } from "./ui";

type Mode = "month" | "week" | "day";
/** zoom levels, closest first */
const MODES: Mode[] = ["day", "week", "month"];
/** How a completion relates to the deadline: color coding of finished chips. */
type Timing = "early" | "on" | "late" | "none";
interface Ev {
  task?: TaskItem;
  date: string;
  /** finished checklist item of the task */
  sub?: string;
  timing?: Timing;
  /** completion time (ms): finished things sit at the time they were done */
  at?: number;
  habit?: { id: string; name: string; color: string };
}

const HOUR = 48;
const CHIP_H = 24;
const TIMING_COLOR: Record<Timing, string> = { early: "#30a46c", on: "var(--accent)", late: "#e5930b", none: "var(--faint)" };
const timingOf = (due: string | null, day: string): Timing => (!due ? "none" : day < due ? "early" : day === due ? "on" : "late");
const prioColor = (p: number) => (p === 3 ? "var(--color-p3)" : p === 2 ? "var(--color-p2)" : p === 1 ? "var(--color-p1)" : "var(--accent)");
const minuteOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

const evColor = (ev: Ev) => (ev.habit ? colorOf(ev.habit.color) : ev.timing ? TIMING_COLOR[ev.timing] : prioColor(ev.task!.priority));
const evTitle = (ev: Ev) => (ev.habit ? ev.habit.name : ev.sub ? `${ev.sub} · ${ev.task!.title}` : ev.task!.title);

function Chip({ ev, onSelect, selected }: { ev: Ev; onSelect: (id: string) => void; selected: boolean }) {
  const c = evColor(ev);
  const finished = !!ev.timing || !!ev.habit;
  const Icon = ev.habit ? Flame : ev.sub ? ListChecks : Check;
  return (
    <button
      draggable={!!ev.task && !ev.task.done && !ev.sub}
      onDragStart={(e) => ev.task && e.dataTransfer.setData("text/task", ev.task.id)}
      onClick={(e) => { e.stopPropagation(); if (ev.task) onSelect(ev.task.id); }}
      className={cx("flex h-full w-full items-center gap-1 truncate rounded px-1.5 py-px text-left text-[11px] leading-5", selected ? "ring-1 ring-accent" : "")}
      title={evTitle(ev)}
      style={{ background: `color-mix(in srgb, ${c} 15%, transparent)`, color: "var(--fg)", borderLeft: `2px solid ${c}` }}
    >
      {finished && <Icon size={10} className="shrink-0" style={{ color: c }} />}
      {!finished && ev.task?.dueTime && <span className="text-muted">{ev.task.dueTime}</span>}
      <span className={cx("truncate", finished && "text-muted")}>{ev.habit?.name ?? ev.sub ?? ev.task?.title}</span>
    </button>
  );
}

interface BodyProps {
  mode: Mode;
  anchor: string;
  anim: string;
  today: string;
  now: Date;
  tasks: TaskItem[];
  habits: { id: string; name: string; color: string; target: number; archived: boolean }[];
  logs: Map<string, Map<string, number>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onZoom: (to: Mode, date: string, el: HTMLElement) => void;
  onCreate: (c: { date: string; time: string | null }) => void;
}

/** One time frame (month grid or week/day columns). Rendered twice while zooming between two levels. */
function Body({ mode, anchor, anim, today, now, tasks, habits, logs, selectedId, onSelect, onZoom, onCreate }: BodyProps) {
  const lang = useLang();
  const { weekStart } = useSettings();
  const scroller = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    if (mode === "month") return monthGrid(anchor, weekStart);
    if (mode === "week") { const s = startOfWeek(anchor, weekStart); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
    return [anchor];
  }, [mode, anchor, weekStart]);

  const events = useMemo(() => {
    const from = days[0], to = days[days.length - 1];
    const map = new Map<string, Ev[]>();
    const push = (date: string, ev: Omit<Ev, "date">) => map.set(date, [...(map.get(date) ?? []), { ...ev, date }]);
    for (const task of tasks) {
      if (task.trashedAt !== null) continue;
      // finished checklist items sit on the day/time they were ticked, whether or not the task itself is done
      for (const it of doneItems(task.notes)) {
        const d = fmtDate(new Date(it.at));
        if (d >= from && d <= to) push(d, { task, sub: it.text, timing: timingOf(task.dueDate, d), at: it.at });
      }
      if (task.done) {
        // a finished task leaves its deadline and shows up where it was completed
        const at = task.completedAt ?? task.updatedAt;
        const d = doneDay(task);
        if (d >= from && d <= to) push(d, { task, timing: timingOf(task.dueDate, d), at });
      } else if (task.dueDate) {
        if (task.repeat) occurrences(task.dueDate, task.repeat, from, to).forEach((d) => push(d, { task }));
        else if (task.dueDate >= from && task.dueDate <= to) push(task.dueDate, { task });
      }
    }
    for (const h of habits) {
      if (h.archived) continue;
      const c = logs.get(h.id);
      if (!c) continue;
      for (const d of days) if ((c.get(d) ?? 0) >= h.target) push(d, { habit: { id: h.id, name: h.name, color: h.color } });
    }
    const rank = (e: Ev) => (e.habit ? 2 : e.timing ? 1 : 0);
    for (const v of map.values()) v.sort((a, b) => rank(a) - rank(b) || (a.at ?? 0) - (b.at ?? 0) || (a.task?.dueTime ?? "").localeCompare(b.task?.dueTime ?? ""));
    return map;
  }, [tasks, habits, logs, days]);

  useLayoutEffect(() => {
    if (mode !== "month" && scroller.current) scroller.current.scrollTop = (days.includes(today) ? Math.max(0, now.getHours() - 1) : 7) * HOUR;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const names = weekdayNames(lang, weekStart);
  const drop = (e: React.DragEvent, date: string, time?: string | null) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task");
    if (id) void local.patch("task", id, time === undefined ? { dueDate: date } : { dueDate: date, dueTime: time });
  };
  const timeFromY = (e: React.MouseEvent | React.DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const min = clamp(Math.round(((e.clientY - r.top) / HOUR) * 4) * 15, 0, 23 * 60 + 45);
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  };

  if (mode === "month") {
    return (
      <>
        <div className="grid grid-cols-7 border-b border-line text-center text-xs text-muted">
          {names.map((n) => <div key={n} className="py-1.5">{n}</div>)}
        </div>
        <div key={anchor} className={`grid min-h-0 flex-1 grid-cols-7 grid-rows-6 ${anim}`}>
          {days.map((d) => {
            const evs = events.get(d) ?? [];
            const out = d.slice(0, 7) !== anchor.slice(0, 7);
            return (
              <div
                key={d}
                data-date={d}
                onClick={(e) => onZoom("week", d, e.currentTarget)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(e, d)}
                className={cx("min-h-0 min-w-0 overflow-hidden border-b border-r border-line p-1", out && "bg-sub/60")}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onZoom("day", d, e.currentTarget.parentElement!); }}
                  className={cx("mb-0.5 grid size-6 place-items-center rounded-full text-xs", d === today ? "bg-accent font-semibold text-white dark:text-[#101012]" : out ? "text-faint" : "text-fg hover:bg-hover")}
                >
                  {Number(d.slice(8))}
                </button>
                <div className="space-y-0.5">
                  {evs.slice(0, 3).map((ev, i) => <div key={i} className="h-5"><Chip ev={ev} onSelect={onSelect} selected={selectedId === ev.task?.id} /></div>)}
                  {evs.length > 3 && <div className="px-1 text-[11px] text-muted">+{evs.length - 3}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <div key={`h${anchor}`} className={`flex border-b border-line pl-12 ${anim}`}>
        {days.map((d) => {
          // deadlines without a time and habit completions; everything with a time sits in the grid
          const head = (events.get(d) ?? []).filter((e) => e.habit || (!e.timing && !e.task?.dueTime));
          return (
            <div key={d} data-date={d} className="min-w-0 flex-1 basis-0 border-l border-line px-1 py-1.5">
              <button onClick={(e) => onZoom("day", d, e.currentTarget.parentElement!)} className={cx("block w-full truncate text-center text-xs", d === today ? "font-semibold text-accent" : "text-muted")}>{fmtLong(d, lang)}</button>
              <div className="mt-1 min-h-6 space-y-0.5" onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, d, null)} onClick={(e) => (mode === "week" ? onZoom("day", d, e.currentTarget.parentElement!) : onCreate({ date: d, time: null }))}>
                {head.slice(0, 3).map((ev, i) => <div key={i} className="h-5"><Chip ev={ev} onSelect={onSelect} selected={selectedId === ev.task?.id} /></div>)}
                {head.length > 3 && <div className="px-1 text-[11px] text-muted">+{head.length - 3}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div key={`g${anchor}`} className={`relative flex ${anim}`} style={{ height: 24 * HOUR }}>
          <div className="w-12 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pr-2 text-right text-[11px] text-faint" style={{ height: HOUR }}>{h > 0 && `${String(h).padStart(2, "0")}:00`}</div>
            ))}
          </div>
          {days.map((d) => {
            const timed = (events.get(d) ?? [])
              .filter((e) => !e.habit && (e.timing || e.task?.dueTime))
              .map((e) => ({ e, top: ((e.at !== undefined ? minuteOf(e.at) : timeToMin(e.task!.dueTime!)) / 60) * HOUR }))
              .sort((a, b) => a.top - b.top);
            // lanes: things at (nearly) the same time stand side by side
            const lanes: number[] = [];
            const placed = timed.map((x) => {
              let lane = lanes.findIndex((end) => end <= x.top);
              if (lane < 0) lane = lanes.length;
              lanes[lane] = x.top + CHIP_H + 2;
              return { ...x, lane };
            });
            const n = Math.max(1, lanes.length);
            return (
              <div
                key={d}
                data-date={d}
                className="relative min-w-0 flex-1 basis-0 border-l border-line"
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, var(--line) ${HOUR - 1}px, var(--line) ${HOUR}px)` }}
                onClick={(e) => (mode === "week" ? onZoom("day", d, e.currentTarget) : onCreate({ date: d, time: timeFromY(e) }))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => drop(e, d, timeFromY(e))}
              >
                {placed.map(({ e, top, lane }, i) => (
                  <div key={i} className="absolute px-px" style={{ top, height: CHIP_H, left: `${(lane / n) * 100}%`, width: `${100 / n}%` }}>
                    <Chip ev={e} onSelect={onSelect} selected={selectedId === e.task?.id} />
                  </div>
                ))}
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
    </>
  );
}

interface Zoom { to: Mode; anchor: string; dir: "in" | "out"; ox: number; oy: number }

export function Calendar({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT();
  const lang = useLang();
  const now = useNow();
  const today = todayStr(now);
  const tasks = useItems("task");
  const habits = useItems("habit");
  const habitLogs = useItems("habitlog");
  const logs = useMemo(() => habitCounts(habitLogs), [habitLogs]);
  const { weekStart } = useSettings();

  const [mode, setMode] = useState<Mode>(() => (window.innerWidth < 768 ? "day" : "month"));
  const [anchor, setAnchor] = useState(today);
  const [fx, setFx] = useState<"in-right" | "in-left" | "none">("none");
  const [create, setCreate] = useState<{ date: string; time: string | null } | null>(null);
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLDivElement>(null);
  const nxt = useRef<HTMLDivElement>(null);
  const prog = useRef(0);
  const S = useRef({ mode, anchor, zoom });
  S.current = { mode, anchor, zoom };
  const anim = fx === "none" ? "" : `anim-${fx}`;

  // Zoom between levels: the current frame grows (or shrinks) around a point while fading into the next one.
  const paint = (p: number, animate: boolean) => {
    prog.current = p;
    const z = S.current.zoom;
    if (!z) return;
    const tr = animate ? "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 280ms ease-out" : "none";
    const origin = `${z.ox}px ${z.oy}px`;
    const set = (el: HTMLDivElement | null, scale: number, opacity: number) => {
      if (!el) return;
      el.style.transition = tr;
      el.style.transformOrigin = origin;
      el.style.transform = `scale(${scale})`;
      el.style.opacity = String(opacity);
    };
    set(cur.current, z.dir === "in" ? 1 + p * 0.9 : 1 - p * 0.4, 1 - p);
    set(nxt.current, z.dir === "in" ? 0.55 + p * 0.45 : 1.5 - p * 0.5, p);
  };
  useLayoutEffect(() => {
    if (zoom) paint(prog.current, false);
    else for (const el of [cur.current, nxt.current]) if (el) { el.style.transition = "none"; el.style.transform = ""; el.style.opacity = ""; }
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = (commit: boolean) => {
    const z = S.current.zoom;
    if (!z) return;
    paint(commit ? 1 : 0, true);
    setTimeout(() => {
      prog.current = 0;
      if (commit) { setFx("none"); setAnchor(z.anchor); setMode(z.to); }
      setZoom(null);
    }, 290);
  };

  const zoomTo = (to: Mode, date: string, el?: HTMLElement | null) => {
    const { mode: m, zoom: z } = S.current;
    if (z || to === m) return;
    const box = wrap.current!.getBoundingClientRect();
    let ox = box.width / 2, oy = box.height / 2;
    if (el) { const r = el.getBoundingClientRect(); ox = r.left + r.width / 2 - box.left; oy = r.top + r.height / 2 - box.top; }
    prog.current = 0;
    setZoom({ to, anchor: date, dir: MODES.indexOf(to) < MODES.indexOf(m) ? "in" : "out", ox, oy });
    requestAnimationFrame(() => requestAnimationFrame(() => finish(true)));
  };

  // pinch: spread = closer (month > week > day), together = wider; the frames follow the fingers
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let d0 = 0, started = false, dir: "in" | "out" = "in", cx = 0, cy = 0, level: Mode = "month", lastZoom: Zoom | null = null;
    const bound: EventTarget[] = [];
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2 || S.current.zoom) return;
      d0 = dist(e); started = false; level = S.current.mode;
      // a level switch replaces the touched elements; their touch events then no longer bubble to the wrapper,
      // so follow the fingers on the touched elements themselves
      for (const t of [e.touches[0].target, e.touches[1].target]) {
        if (bound.includes(t)) continue;
        t.addEventListener("touchmove", move as EventListener, { passive: false });
        t.addEventListener("touchend", end as EventListener, { passive: true });
        t.addEventListener("touchcancel", end as EventListener, { passive: true });
        bound.push(t);
      }
      cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    };
    function move(e: TouchEvent) {
      if (!d0 || e.touches.length !== 2) return;
      e.preventDefault();
      const s = dist(e) / d0;
      if (!started) {
        if (Math.abs(s - 1) < 0.05) return;
        dir = s > 1 ? "in" : "out";
        const i = MODES.indexOf(level) + (dir === "in" ? -1 : 1);
        if (i < 0 || i >= MODES.length) { d0 = 0; return; }
        const box = wrap.current!.getBoundingClientRect();
        started = true;
        prog.current = 0;
        // always into the month/week/day that is showing, not the one under the fingers
        lastZoom = { to: MODES[i], anchor: S.current.anchor, dir, ox: cx - box.left, oy: cy - box.top };
        setZoom(lastZoom);
        return;
      }
      const p = dir === "in" ? clamp((s - 1) / 0.7, 0, 1) : clamp((1 - s) / 0.4, 0, 1);
      paint(p, false);
      if (p >= 1 && lastZoom) {
        // a long pinch continues into the next level: switch now (identical picture), then measure from here
        setFx("none"); setAnchor(lastZoom.anchor); setMode(lastZoom.to); setZoom(null);
        level = lastZoom.to; lastZoom = null;
        prog.current = 0; started = false; d0 = dist(e);
      }
    }
    function unbind() {
      for (const t of bound.splice(0)) {
        t.removeEventListener("touchmove", move as EventListener);
        t.removeEventListener("touchend", end as EventListener);
        t.removeEventListener("touchcancel", end as EventListener);
      }
    }
    function end() {
      if (!d0) { unbind(); return; }
      d0 = 0;
      unbind();
      if (!started) return;
      started = false;
      finish(prog.current > 0.35);
    }
    el.addEventListener("touchstart", start, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      unbind();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (d: 1 | -1) => {
    if (zoom) return;
    setFx(d > 0 ? "in-right" : "in-left");
    setAnchor(mode === "month" ? addMonths(anchor, d) : addDays(anchor, d * (mode === "week" ? 7 : 1)));
  };
  useSwipe(() => wrap.current, { ignoreLeftEdge: 32, onLeft: () => step(1), onRight: () => step(-1) }, [mode, anchor, zoom]);

  const days = mode === "month" ? [anchor] : mode === "week" ? [startOfWeek(anchor, weekStart), addDays(startOfWeek(anchor, weekStart), 6)] : [anchor];
  const title = mode === "month" ? fmtMonth(anchor, lang) : mode === "day" ? fmtLong(anchor, lang) : `${fmtLong(days[0], lang)} – ${fmtLong(days[1], lang)}`;
  const modeOptions = [{ value: "month" as Mode, label: t("month") }, { value: "week" as Mode, label: t("week") }, { value: "day" as Mode, label: t("day") }];

  const shared = { today, now, tasks, habits, logs, selectedId, onSelect, onCreate: setCreate, onZoom: zoomTo };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={<span className="truncate text-lg capitalize md:text-[22px]">{title}</span>}>
        <IconButton label="<" onClick={() => step(-1)}><ChevronLeft size={18} /></IconButton>
        <Button onClick={() => { if (zoom) return; setFx(today > anchor ? "in-right" : "in-left"); setAnchor(today); }}>{t("today_btn")}</Button>
        <IconButton label=">" onClick={() => step(1)}><ChevronRight size={18} /></IconButton>
        <div className="max-md:hidden"><Segmented value={mode} onChange={(m) => zoomTo(m, anchor)} options={modeOptions} /></div>
      </PageHeader>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-1.5 md:hidden">
        <Segmented value={mode} onChange={(m) => zoomTo(m, anchor)} options={modeOptions} />
        <Legend />
      </div>

      <div ref={wrap} className="relative min-h-0 flex-1 touch-pan-y overflow-hidden">
        <div ref={cur} className="absolute inset-0 flex flex-col bg-bg will-change-transform">
          <Body key={mode} mode={mode} anchor={anchor} anim={anim} {...shared} />
        </div>
        {zoom && (
          <div ref={nxt} className="pointer-events-none absolute inset-0 flex flex-col bg-bg will-change-transform" style={{ opacity: 0 }}>
            <Body key={zoom.to} mode={zoom.to} anchor={zoom.anchor} anim="" {...shared} />
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
