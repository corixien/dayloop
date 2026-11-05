import { CalendarPlus, Check, CheckCheck, Flame, ListPlus, Plus, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { habitLogId } from "@dayloop/shared";
import { local, useItems, useLang, useT } from "../lib/app";
import { fmtLong, todayStr } from "../lib/dates";
import { fuzzyScore } from "../lib/fuzzy";
import { habitCounts } from "../lib/habits";
import { parseQuick } from "../lib/nlp";
import { type QuickKind, quickCreate } from "../lib/quick";
import { toggleDone } from "../lib/tasks";
import { cx } from "./ui";

interface Row {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  score: number;
  /** ctrl: Ctrl/Cmd+Enter (complete a task) */
  run: (ctrl: boolean) => void | Promise<void>;
}

/**
 * Ctrl/Cmd+K, "/" or the sidebar search: jump to a page or task, tick a habit, or just type something new
 * ("Zahnarzt morgen 15 Uhr", "Referat: recherchieren, Folien, üben") and Enter creates it. Typo-tolerant.
 */
export function CommandPalette({ onClose, onOpenTask, onNew }: { onClose: () => void; onOpenTask: (id: string) => void; onNew: (kind: QuickKind) => void }) {
  const t = useT();
  const lang = useLang();
  const tasks = useItems("task");
  const habits = useItems("habit");
  const logs = useItems("habitlog");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [flash, setFlash] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => input.current?.focus(), []);

  const go = (to: string) => () => { location.hash = to; onClose(); };
  const text = q.trim();

  const rows = useMemo<Row[]>(() => {
    const nav: Row[] = ([
      ["/todo", t("todoTab")], ["/done", t("haveDone")], ["/calendar", t("calendar")], ["/habits", t("habits")], ["/pomodoro", t("pomodoro")],
      ["/motivation", t("motivation")], ["/assistant", t("assistant")], ["/trash", t("trash")], ["/settings", t("settings")],
    ] as const).map(([to, label]) => ({ key: to, label, hint: t("goTo"), icon: <Search size={14} />, score: 0, run: go(to) }));

    const today = todayStr();
    const counts = habitCounts(logs);
    const habitRows: Row[] = habits.filter((h) => !h.archived).map((h) => ({
      key: `h${h.id}`, label: h.name, hint: t("cmdHabit"), icon: <Flame size={14} />, score: 0,
      run: async () => {
        const cur = counts.get(h.id)?.get(today) ?? 0;
        await local.put("habitlog", habitLogId(h.id, today), { habitId: h.id, date: today, count: Math.min(cur + 1, Math.max(h.target, cur)) });
        setFlash(`${t("cmdAdded")}: ${h.name}`); setQ(""); setSel(0);
      },
    }));
    const taskRows: Row[] = tasks.filter((x) => x.trashedAt === null).map((x) => ({
      key: x.id, label: x.title, hint: x.done ? t("cmdDoneHint") : t("tasks"), icon: x.done ? <CheckCheck size={14} /> : <Check size={14} />, score: 0,
      run: async (ctrl) => { if (ctrl) { await toggleDone(x); setFlash(`${t("cmdComplete")}: ${x.title}`); setQ(""); setSel(0); } else { onOpenTask(x.id); onClose(); } },
    }));

    const make = (kind: QuickKind, label: string, icon: ReactNode): Row => ({
      key: `new-${kind}`, label: text || label, hint: text ? label : "", icon, score: 0,
      run: async () => {
        if (!text) { onClose(); onNew(kind); return; }
        const title = await quickCreate(text, kind);
        if (title) { setFlash(`${t("cmdAdded")}: ${title}`); setQ(""); setSel(0); }
      },
    });
    const create: Row[] = [make("todo", t("cmdNewTask"), <Plus size={14} />), make("done", t("cmdNewDone"), <CheckCheck size={14} />), make("event", t("cmdNewEvent"), <CalendarPlus size={14} />)];

    if (!text) return [...create.map((r) => ({ ...r, icon: <ListPlus size={14} /> })), ...nav, ...taskRows.filter((r) => !tasks.find((x) => x.id === r.key)?.done).slice(0, 6)];

    const rank = [...nav, ...habitRows, ...taskRows]
      .map((r) => ({ ...r, score: fuzzyScore(text, r.label) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    // a clear hit (the typed text is inside a name) comes first; otherwise Enter creates what was typed
    return (rank[0]?.score ?? 0) >= 72 ? [...rank.slice(0, 14), ...create] : [...create, ...rank.slice(0, 8)];
  }, [text, tasks, habits, logs, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = text ? parseQuick(text) : null;
  const detail = parsed ? [parsed.dueDate && `${fmtLong(parsed.dueDate, lang)}${parsed.dueTime ? ` ${parsed.dueTime}` : ""}`, parsed.items.length && `${parsed.items.length} ${t("cmdSubItems")}`].filter(Boolean).join(" · ") : "";
  const shown = rows.slice(0, 30);

  useEffect(() => { list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={t("search")} className="pop w-full max-w-lg overflow-hidden rounded-xl border border-line bg-raise shadow-xl">
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); setFlash(""); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") { e.preventDefault(); void shown[sel]?.run(e.ctrlKey || e.metaKey); }
          }}
          placeholder={t("search")}
          aria-label={t("search")}
          className="h-11 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-faint"
        />
        {flash && <div role="status" className="flex items-center gap-2 border-b border-line px-4 py-2 text-[13px] text-accent"><Check size={14} />{flash}</div>}
        <ul ref={list} className="max-h-80 overflow-y-auto p-1.5">
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t("noResults")}</li>}
          {shown.map((c, i) => (
            <li key={c.key}>
              <button data-i={i} onMouseMove={() => setSel(i)} onClick={() => void c.run(false)} className={cx("flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13px]", i === sel && "bg-hover")}>
                <span className="shrink-0 text-muted">{c.icon}</span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.key.startsWith("new-") && detail && <span className="shrink-0 truncate text-[11px] text-accent">{detail}</span>}
                <span className="ml-1 shrink-0 text-xs text-faint">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-1.5 text-[11px] text-faint max-md:hidden">{t("cmdFooter")}</div>
      </div>
    </div>
  );
}
