import { CalendarPlus, Check, CheckCheck, ChevronLeft, Flame, ListPlus, NotebookPen, Plus, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { habitLogId } from "@dayloop/shared";
import { local, useItems, useLang, useT } from "../lib/app";
import { fmtLong, todayStr } from "../lib/dates";
import { fuzzyScore } from "../lib/fuzzy";
import { habitCounts } from "../lib/habits";
import { parseQuick } from "../lib/nlp";
import { type QuickKind, quickCreate, quickNotes } from "../lib/quick";
import { toggleDone } from "../lib/tasks";
import { NotesEditor } from "./NotesEditor";
import { Button, cx } from "./ui";

interface Row {
  key: string;
  label: string;
  hint: string;
  icon: ReactNode;
  score: number;
  /** ctrl: Ctrl/Cmd+Enter (complete a task) */
  run: (ctrl: boolean) => void | Promise<void>;
  /** create rows: open the detail editor (title, notes, sub-items) instead of creating right away */
  details?: () => void;
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
  const [compose, setCompose] = useState<{ kind: QuickKind; title: string; notes: string } | null>(null);
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
      details: () => {
        const p = parseQuick(text);
        setCompose({ kind, title: p.items.length ? text.slice(0, text.indexOf(":")).trim() : text, notes: quickNotes(p) });
      },
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

  const submitCompose = async () => {
    if (!compose || !compose.title.trim()) return;
    const title = await quickCreate(compose.title, compose.kind, compose.notes.trim());
    if (title) { setFlash(`${t("cmdAdded")}: ${title}`); setCompose(null); setQ(""); setSel(0); setTimeout(() => input.current?.focus(), 0); }
  };
  const cp = compose ? parseQuick(compose.title) : null;

  if (compose) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/40 p-4 pt-[8vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div
          role="dialog"
          aria-label={t("cmdDetails")}
          className="pop w-full max-w-lg overflow-hidden rounded-xl border border-line bg-raise shadow-xl"
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); setCompose(null); setTimeout(() => input.current?.focus(), 0); }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submitCompose(); }
          }}
        >
          <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
            <button onClick={() => { setCompose(null); setTimeout(() => input.current?.focus(), 0); }} aria-label={t("cmdBack")} className="grid size-8 place-items-center rounded-md text-muted hover:bg-hover"><ChevronLeft size={18} /></button>
            <span className="text-[13px] font-medium">{compose.kind === "todo" ? t("cmdNewTask") : compose.kind === "done" ? t("cmdNewDone") : t("cmdNewEvent")}</span>
          </div>
          <div className="space-y-3 p-4">
            <input
              autoFocus
              value={compose.title}
              onChange={(e) => setCompose({ ...compose, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); void submitCompose(); } }}
              placeholder={t("cmdTitleHint")}
              aria-label={t("title")}
              className="w-full bg-transparent text-lg font-semibold outline-none placeholder:font-normal placeholder:text-faint"
            />
            {cp && (cp.dueDate || cp.priority || cp.repeat) && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {cp.dueDate && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{fmtLong(cp.dueDate, lang)}{cp.dueTime ? ` ${cp.dueTime}` : ""}</span>}
                {cp.repeat && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{t(cp.repeat.freq)}</span>}
                {cp.priority > 0 && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-accent">{"!".repeat(cp.priority)}</span>}
              </div>
            )}
            <NotesEditor value={compose.notes} onChange={(v) => setCompose((c) => c && { ...c, notes: v })} onCommit={() => {}} placeholder={t("addNote")} label={t("note")} />
            <p className="text-[11px] text-faint">{t("cmdComposeHint")}</p>
            <Button variant="primary" className="h-10 w-full text-[14px]" disabled={!compose.title.trim()} onClick={() => void submitCompose()}>{t("add")}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={t("search")} className="pop w-full max-w-lg overflow-hidden rounded-xl border border-line bg-raise shadow-xl">
        <input
          ref={input}
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); setFlash(""); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, shown.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Tab" && shown[sel]?.details) { e.preventDefault(); shown[sel].details!(); }
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
            <li key={c.key} className="relative">
              <button data-i={i} onMouseMove={() => setSel(i)} onClick={() => void c.run(false)} className={cx("flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13px]", i === sel && "bg-hover", c.details && "pr-24 md:pr-3")}>
                <span className="shrink-0 text-muted">{c.icon}</span>
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {c.key.startsWith("new-") && detail && <span className="shrink-0 truncate text-[11px] text-accent">{detail}</span>}
                <span className="ml-1 shrink-0 text-xs text-faint">{c.hint}</span>
              </button>
              {c.details && (
                <button
                  type="button"
                  onClick={c.details}
                  title={`${t("cmdDetails")} (Tab)`}
                  aria-label={`${t("cmdDetails")}: ${c.hint || c.label}`}
                  className={cx("absolute right-1.5 top-1/2 hidden h-7 -translate-y-1/2 items-center gap-1 rounded-md border border-line bg-raise px-2 text-[11px] text-muted hover:text-fg max-md:flex", i === sel && "md:flex")}
                ><NotebookPen size={12} />{t("cmdDetails")}</button>
              )}
            </li>
          ))}
        </ul>
        <div className="border-t border-line px-4 py-1.5 text-[11px] text-faint max-md:hidden">{t("cmdFooter")}</div>
      </div>
    </div>
  );
}
