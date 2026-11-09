import { ChevronLeft, ChevronRight, ListChecks } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLang, useNow, useT } from "../lib/app";
import { addDays, fmtLong, todayStr } from "../lib/dates";
import { noteStats, parseNotes, stripMarks } from "../lib/notes";
import { usePlan } from "../lib/plan";
import { DAY_MIN, fromMin, nextStart, defaultEnd, toMin } from "../lib/planLogic";
import { useSwipe } from "../lib/swipe";
import { PlanEditor, type PlanInit } from "./PlanEditor";
import { Button, IconButton, PageHeader, cx } from "./ui";

const HOUR_MIN = 48, HOUR_MAX = 480, HOUR_DEFAULT = 96; // px per hour, changed by pinch (or Ctrl + wheel)
const clampHour = (v: number) => Math.max(HOUR_MIN, Math.min(HOUR_MAX, v));
const MIN_H = 24; // short blocks are drawn at least this high; blocks are always full width; where they overlap the earlier one is on top
const GUTTER = 52;

/** One day as a time axis (00:00 at the top, 24:00 at the bottom). Day-wise only: swipe or arrows, no week/month. */
export function Plan() {
  const t = useT();
  const lang = useLang();
  const now = useNow();
  const today = todayStr(now);
  const [day, setDay] = useState(today);
  const [fx, setFx] = useState("");
  const [hr, setHr] = useState(() => clampHour(Number(localStorage.getItem("dl_planzoom")) || HOUR_DEFAULT));
  const y = (min: number) => (min * hr) / 60;
  const [edit, setEdit] = useState<PlanInit | null>(null);
  const blocks = usePlan(day);
  const scroller = useRef<HTMLDivElement>(null);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = day === today;

  const step = useCallback((n: number) => { setFx(n > 0 ? "anim-in-right" : "anim-in-left"); setDay((d) => addDays(d, n)); }, []);
  useSwipe(() => scroller.current, { ignoreLeftEdge: 32, onLeft: () => step(1), onRight: () => step(-1) }, [step]);

  // Open on the current time (today) or on the first block (other days)
  const centered = useRef("");
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || centered.current === day) return;
    if (!isToday && !blocks.length && centered.current === "") return;
    const target = isToday ? y(nowMin) : blocks.length ? y(toMin(blocks[0].start)) - 24 : y(8 * 60);
    el.scrollTop = Math.max(0, isToday ? target - el.clientHeight / 2 : target);
    centered.current = day;
  }, [day, isToday, blocks, nowMin]);

  // Zoom the time scale: pinch (two fingers) or Ctrl + wheel; the minute under the fingers stays where it is
  const press = useRef<{ x: number; y: number; id: number } | null>(null);
  const hold = useRef<{ minute: number; offset: number } | null>(null);
  const zoomTo = (next: number, clientY: number, anchor?: { minute: number; offset: number }) => {
    const el = scroller.current!;
    const off = clientY - el.getBoundingClientRect().top;
    hold.current = anchor ?? { minute: ((off + el.scrollTop) * 60) / hr, offset: off };
    setHr(clampHour(next));
  };
  useLayoutEffect(() => {
    const el = scroller.current, h = hold.current;
    if (el && h) el.scrollTop = (h.minute * hr) / 60 - h.offset;
    localStorage.setItem("dl_planzoom", String(Math.round(hr)));
  }, [hr]);
  const hrRef = useRef(hr);
  hrRef.current = hr;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let pinch: { d0: number; hr0: number; minute: number; offset: number } | null = null;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const midY = (e: TouchEvent) => (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      if (press.current) { clearTimeout(press.current.id); press.current = null; }
      const off = midY(e) - el.getBoundingClientRect().top;
      pinch = { d0: dist(e), hr0: hrRef.current, minute: ((off + el.scrollTop) * 60) / hrRef.current, offset: off };
    };
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      zoomTo(pinch.hr0 * (dist(e) / pinch.d0), midY(e), { minute: pinch.minute, offset: midY(e) - el.getBoundingClientRect().top });
    };
    const onEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinch = null; };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(hrRef.current * Math.exp(-e.deltaY * 0.01), e.clientY);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const create = (min?: number) => {
    const start = min !== undefined ? fromMin(Math.floor(min / 15) * 15) : nextStart(blocks, isToday ? nowMin : null);
    setEdit({ date: day, start, end: defaultEnd(start) });
  };
  useEffect(() => {
    const on = () => create();
    window.addEventListener("dl-new-plan", on);
    return () => window.removeEventListener("dl-new-plan", on);
  });

  // double click (mouse) or press and hold (touch) on an empty spot creates a block there
  const at = (clientY: number) => {
    const r = scroller.current!.getBoundingClientRect();
    return ((clientY - r.top + scroller.current!.scrollTop) * 60) / hr;
  };
  const title = fmtLong(day, lang);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={<span className="truncate text-lg capitalize md:text-[22px]">{isToday ? `${t("plan")} · ${t("today")}` : t("plan")}</span>}>
        <IconButton label="<" onClick={() => step(-1)}><ChevronLeft size={18} /></IconButton>
        <Button onClick={() => { if (day !== today) { setFx(today > day ? "anim-in-right" : "anim-in-left"); centered.current = ""; setDay(today); } else if (scroller.current) scroller.current.scrollTo({ top: Math.max(0, y(nowMin) - scroller.current.clientHeight / 2), behavior: "smooth" }); }}>{t("today_btn")}</Button>
        <IconButton label=">" onClick={() => step(1)}><ChevronRight size={18} /></IconButton>
      </PageHeader>
      <div className="shrink-0 border-b border-line px-4 py-1.5 text-[13px] capitalize text-muted md:px-6">{title}</div>
      <div ref={scroller} className="relative min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
        <div
          key={day}
          className={cx("relative", fx)}
          style={{ height: y(DAY_MIN) }}
          onDoubleClick={(e) => { if ((e.target as HTMLElement).closest("[data-block]")) return; create(at(e.clientY)); }}
          onTouchStart={(e) => {
            if ((e.target as HTMLElement).closest("[data-block]") || e.touches.length !== 1) return;
            const tt = e.touches[0];
            const cy = tt.clientY;
            press.current = { x: tt.clientX, y: cy, id: window.setTimeout(() => { press.current = null; create(at(cy)); }, 480) };
          }}
          onTouchMove={(e) => { const p = press.current, tt = e.touches[0]; if (p && Math.hypot(tt.clientX - p.x, tt.clientY - p.y) > 8) { clearTimeout(p.id); press.current = null; } }}
          onTouchEnd={() => { if (press.current) { clearTimeout(press.current.id); press.current = null; } }}
        >
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute inset-x-0" style={{ top: y(h * 60) }}>
              <div className="absolute inset-x-0 top-0 border-t border-line" style={{ left: GUTTER - 6 }} />
              <div className="absolute inset-x-0 border-t border-dashed border-line/50" style={{ top: hr / 2, left: GUTTER }} />
              <span className="absolute -top-2 left-3 w-9 text-right text-[11px] tabular-nums text-muted">{h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}</span>
            </div>
          ))}
          {!blocks.length && <p className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-bg px-2 text-[13px] text-faint" style={{ top: y(isToday ? Math.max(nowMin, 6 * 60) + 40 : 9 * 60) }}>{t("planEmpty")}</p>}
          {blocks.map((b, idx) => {
            const s = toMin(b.start), e = Math.max(toMin(b.end), s + 1);
            const h = Math.max(y(e - s), MIN_H);
            // earlier blocks lie on top of later ones, except one that lies completely inside an earlier one (it would be hidden)
            const inside = blocks.some((o, j) => j < idx && toMin(o.start) <= s && toMin(o.end) >= e);
            const tight = h < 30;
            const st = noteStats(b.notes);
            const lines = parseNotes(b.notes).filter((l) => l.text.trim());
            const live = isToday && nowMin >= s && nowMin < e;
            const past = isToday && nowMin >= e;
            return (
              <button
                key={b.id}
                data-block
                onClick={() => setEdit({ id: b.id, date: b.date, start: b.start, end: b.end })}
                className={cx(
                  "absolute overflow-hidden rounded-lg border-l-[5px] border-accent bg-accent-soft pl-2.5 pr-2 text-left shadow-sm ring-1 ring-line transition-shadow hover:shadow-md", tight ? "py-0" : "py-1",
                  live && "ring-2 ring-accent", past && "opacity-70",
                )}
                style={{ top: y(s) + 1, height: h - 2, left: GUTTER, right: 8, zIndex: blocks.length - idx + (inside ? blocks.length : 0) }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold leading-tight">{stripMarks(b.title)}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">{b.start}–{b.end}</span>
                </div>
                {h >= 60 && (
                  <div className="mt-0.5 space-y-px overflow-hidden text-[12px] leading-snug text-muted">
                    {lines.slice(0, Math.floor((h - 34) / 16)).map((l, i) => (
                      <div key={i} className={cx("truncate", l.check && l.done && "line-through")}>{l.check ? (l.done ? "☑ " : "☐ ") : ""}{stripMarks(l.text)}</div>
                    ))}
                  </div>
                )}
                {h < 60 && !tight && st.total > 0 && <ListChecks size={12} className="absolute bottom-1 right-2 text-muted" />}
              </button>
            );
          })}
          {isToday && (
            <div className="pointer-events-none absolute z-20 flex items-center" style={{ top: y(nowMin), left: GUTTER - 10, right: 0 }} aria-label="now">
              <span className="size-2.5 rounded-full bg-danger" />
              <span className="h-0.5 flex-1 bg-danger" />
            </div>
          )}
        </div>
      </div>
      {edit && <PlanEditor key={edit.id ?? "new"} init={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
