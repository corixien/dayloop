import { ChevronLeft, ChevronRight, Flame, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { habitLogId } from "@dayloop/shared";
import { local, uid, useItems, useLang, useNow, useSettings, useT } from "../lib/app";
import { addDays, addMonths, fmtMonth, monthGrid, todayStr, weekdayNames } from "../lib/dates";
import { habitCounts, habitStats, isActive } from "../lib/habits";
import type { Item } from "../lib/db";
import { Button, Check_, ColorPicker, Dialog, Empty, Field, IconButton, PageHeader, colorOf, cx, inputCls } from "./ui";

type Habit = Item<"habit">;

function setCount(habitId: string, date: string, count: number) {
  return local.put("habitlog", habitLogId(habitId, date), { habitId, date, count: Math.max(0, count) });
}

function useCounts() {
  const logs = useItems("habitlog");
  return useMemo(() => habitCounts(logs), [logs]);
}

export function Habits() {
  const t = useT();
  const today = todayStr(useNow());
  const habits = useItems("habit").filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const counts = useCounts();
  const [edit, setEdit] = useState<Habit | "new" | null>(null);
  const [open, setOpen] = useState<Habit | null>(null);
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("habits")}>
        <Button variant="primary" onClick={() => setEdit("new")}><Plus size={14} /> {t("newHabit")}</Button>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {habits.length === 0 && <Empty>{t("noHabits")}</Empty>}
        {habits.map((h) => {
          const c = counts.get(h.id) ?? new Map<string, number>();
          const s = habitStats(h, c, today);
          const n = c.get(today) ?? 0;
          const active = isActive(h, today);
          return (
            <div key={h.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 md:px-6">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: colorOf(h.color) }} />
              <button onClick={() => setOpen(h)} className="min-w-0 flex-1 text-left">
                <div className="truncate text-[14px] font-medium">{h.name}</div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1"><Flame size={12} className={s.current > 0 ? "text-p2" : ""} />{s.current}</span>
                  {h.target > 1 && <span>{n}/{h.target} {h.unit}</span>}
                </div>
              </button>
              <div className="hidden gap-1 sm:flex" aria-hidden>
                {last7.map((d) => {
                  const ok = (c.get(d) ?? 0) >= h.target;
                  return <span key={d} className={cx("size-2.5 rounded-full", ok ? "" : isActive(h, d) ? "bg-line" : "bg-line/40")} style={ok ? { background: colorOf(h.color) } : undefined} />;
                })}
              </div>
              {h.target === 1 ? (
                <Check_ done={n >= 1} onChange={() => void setCount(h.id, today, n >= 1 ? 0 : 1)} label={h.name} />
              ) : (
                <div className="flex items-center gap-1">
                  <Button className="size-8 px-0" onClick={() => void setCount(h.id, today, n - 1)} disabled={n === 0} aria-label="-">−</Button>
                  <Button className="size-8 px-0" variant={n >= h.target ? "primary" : "default"} onClick={() => void setCount(h.id, today, n + 1)} aria-label="+">+</Button>
                </div>
              )}
              {!active && <span className="sr-only">inactive today</span>}
            </div>
          );
        })}
      </div>
      {edit && <HabitDialog habit={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
      {open && <HabitDetail habit={open} counts={counts.get(open.id) ?? new Map()} today={today} onEdit={() => { setEdit(open); setOpen(null); }} onClose={() => setOpen(null)} />}
    </div>
  );
}

function HabitDetail({ habit, counts, today, onEdit, onClose }: { habit: Habit; counts: Map<string, number>; today: string; onEdit: () => void; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const { weekStart } = useSettings();
  const [anchor, setAnchor] = useState(today);
  const s = habitStats(habit, counts, today);
  const names = weekdayNames(lang, weekStart, "narrow");
  return (
    <Dialog title={habit.name} onClose={onClose} wide>
      <div className="mb-4 grid grid-cols-4 gap-2 text-center">
        {([[t("streak"), s.current], [t("bestStreak"), s.best], [t("total"), s.total], [t("rate30"), `${s.rate30}%`]] as const).map(([label, v]) => (
          <div key={label} className="rounded-lg border border-line bg-sub py-2">
            <div className="text-lg font-semibold tabular-nums">{v}</div>
            <div className="text-[11px] text-muted">{label}</div>
          </div>
        ))}
      </div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium capitalize">{fmtMonth(anchor, lang)}</span>
        <span>
          <IconButton label="<" onClick={() => setAnchor(addMonths(anchor, -1))}><ChevronLeft size={16} /></IconButton>
          <IconButton label=">" onClick={() => setAnchor(addMonths(anchor, 1))}><ChevronRight size={16} /></IconButton>
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {names.map((n, i) => <div key={i}>{n}</div>)}
        {monthGrid(anchor, weekStart).map((d) => {
          const n = counts.get(d) ?? 0;
          const done = n >= habit.target;
          const inMonth = d.slice(0, 7) === anchor.slice(0, 7);
          const can = isActive(habit, d) && d <= today;
          return (
            <button
              key={d}
              disabled={!can}
              onClick={() => void setCount(habit.id, d, habit.target === 1 ? (n ? 0 : 1) : n >= habit.target ? 0 : n + 1)}
              className={cx("grid aspect-square place-items-center rounded-md text-xs tabular-nums disabled:cursor-default", !inMonth && "opacity-30", !done && can && "bg-sub ring-1 ring-line hover:bg-hover", d === today && "font-bold")}
              style={done ? { background: colorOf(habit.color), color: "#fff" } : n > 0 ? { background: `color-mix(in srgb, ${colorOf(habit.color)} 35%, transparent)` } : undefined}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={onEdit}>{t("edit")}</Button></div>
    </Dialog>
  );
}

function HabitDialog({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const { weekStart } = useSettings();
  const [name, setName] = useState(habit?.name ?? "");
  const [color, setColor] = useState(habit?.color ?? "green");
  const [target, setTarget] = useState(habit?.target ?? 1);
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [days, setDays] = useState(habit?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [reminder, setReminder] = useState(habit?.reminderTime ?? "");
  const names = weekdayNames(lang, weekStart);
  const order = weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];

  async function save() {
    if (!name.trim() || days.length === 0) return;
    await local.put("habit", habit?.id ?? uid(), {
      ...(habit ?? { startDate: todayStr(), order: Date.now() }),
      name: name.trim(), color, target, unit, days, reminderTime: reminder || null,
    });
    onClose();
  }

  return (
    <Dialog title={habit ? t("edit") : t("newHabit")} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t("name")}><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("color")}><ColorPicker value={color} onChange={setColor} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("habitTarget")}><input type="number" min={1} max={100} className={inputCls} value={target} onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))} /></Field>
          <Field label={t("habitUnit")}><input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Glas" /></Field>
        </div>
        <Field label={t("habitDays")}>
          <div className="flex gap-1">
            {order.map((d, i) => (
              <button key={d} onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                className={cx("h-8 flex-1 rounded text-xs ring-1", days.includes(d) ? "bg-accent-soft text-accent ring-accent" : "text-muted ring-line")}>{names[i]}</button>
            ))}
          </div>
        </Field>
        <Field label={t("reminderTime")}><input type="time" className={inputCls} value={reminder} onChange={(e) => setReminder(e.target.value)} /></Field>
        <div className="flex justify-between pt-1">
          {habit ? <Button variant="danger" onClick={async () => { if (confirm(t("confirmDelete"))) { await local.remove("habit", habit.id); onClose(); } }}>{t("delete")}</Button> : <span />}
          <div className="flex gap-2">
            <Button onClick={onClose}>{t("cancel")}</Button>
            <Button variant="primary" onClick={() => void save()}>{t("save")}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
