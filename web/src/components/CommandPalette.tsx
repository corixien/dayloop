import { useEffect, useMemo, useRef, useState } from "react";
import { useItems, useT } from "../lib/app";
import { cx } from "./ui";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/** Ctrl/Cmd+K: jump to any view, list, tag or task. */
export function CommandPalette({ onClose, onOpenTask }: { onClose: () => void; onOpenTask: (id: string) => void }) {
  const t = useT();
  const tasks = useItems("task");
  const lists = useItems("list");
  const tags = useItems("tag");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const go = (to: string) => () => {
    location.hash = to;
    onClose();
  };
  const all = useMemo<Cmd[]>(() => {
    const nav: Cmd[] = [
      ["/inbox", t("inbox")], ["/today", t("today")], ["/next7", t("next7")], ["/all", t("all")], ["/done", t("done")], ["/trash", t("trash")],
      ["/calendar", t("calendar")], ["/habits", t("habits")], ["/pomodoro", t("pomodoro")], ["/matrix", t("matrix")], ["/settings", t("settings")],
    ].map(([to, label]) => ({ id: to, label, hint: t("goTo"), run: go(to) }));
    return [
      ...nav,
      ...lists.map((l) => ({ id: l.id, label: l.name, hint: t("lists"), run: go(`/list/${l.id}`) })),
      ...tags.map((g) => ({ id: g.id, label: `# ${g.name}`, hint: t("tags"), run: go(`/tag/${g.id}`) })),
      ...tasks.filter((x) => x.trashedAt === null).map((x) => ({
        id: x.id, label: x.title, hint: t("tasks"), run: () => { onOpenTask(x.id); onClose(); },
      })),
    ];
  }, [tasks, lists, tags, t]);

  const needle = q.trim().toLowerCase();
  const results = (needle ? all.filter((c) => c.label.toLowerCase().includes(needle)) : all.slice(0, 11)).slice(0, 30);

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={t("search")} className="pop w-full max-w-lg overflow-hidden rounded-xl border border-line bg-raise shadow-xl">
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter") results[sel]?.run();
          }}
          placeholder={t("search")}
          className="h-11 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-faint"
        />
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t("noResults")}</li>}
          {results.map((c, i) => (
            <li key={c.hint + c.id}>
              <button onMouseMove={() => setSel(i)} onClick={c.run} className={cx("flex h-8 w-full items-center justify-between rounded-md px-3 text-left text-[13px]", i === sel && "bg-hover")}>
                <span className="truncate">{c.label}</span>
                <span className="ml-3 shrink-0 text-xs text-faint">{c.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
