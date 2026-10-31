import { Check, ChevronDown, X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const COLORS: Record<string, string> = {
  gray: "#8d8d98", red: "#e5484d", orange: "#f76b15", amber: "#e5a50b", green: "#30a46c",
  teal: "#12a594", blue: "#3e63dd", indigo: "#5b5bd6", purple: "#8e4ec6", pink: "#d6409f",
};
export const colorOf = (name: string) => COLORS[name] ?? COLORS.gray;

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Button({
  variant = "default", className, ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-ctl px-3 text-[13px] font-medium transition-colors disabled:opacity-50",
        variant === "default" && "border border-line bg-raise hover:bg-hover",
        variant === "primary" && "bg-accent text-white hover:brightness-110 dark:text-[#101012]",
        variant === "ghost" && "hover:bg-hover text-muted hover:text-fg",
        variant === "danger" && "border border-line text-danger hover:bg-hover",
        className,
      )}
    />
  );
}

export function IconButton({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-ctl text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40",
        className,
      )}
    />
  );
}

export const inputCls =
  "h-8 w-full rounded-ctl border border-line bg-raise px-2.5 text-[13px] placeholder:text-faint focus:border-accent";

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/** Round checkbox colored by priority. */
export function Check_({ done, priority = 0, onChange, label }: { done: boolean; priority?: number; onChange: () => void; label: string }) {
  const col = priority === 3 ? "var(--color-p3)" : priority === 2 ? "var(--color-p2)" : priority === 1 ? "var(--color-p1)" : "var(--faint)";
  return (
    <button
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] transition-colors"
      style={{ borderColor: col, background: done ? col : "transparent" }}
    >
      {done && <Check size={11} strokeWidth={3} className="text-white" />}
    </button>
  );
}

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-label={title}
        className={cx("pop max-h-[90dvh] w-full overflow-auto rounded-xl border border-line bg-raise shadow-xl", wide ? "max-w-xl" : "max-w-sm")}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton label="×" onClick={onClose} className="-mr-2 size-7">
            <X size={16} />
          </IconButton>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value, options, onChange,
}: { value: T; options: { value: T; label: string; color?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-ctl border border-line bg-sub p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-7 rounded-[5px] px-2.5 text-xs font-medium transition-colors",
            o.value === value ? "bg-raise text-fg shadow-sm" : "text-muted hover:text-fg",
          )}
          style={o.value === value && o.color ? { color: o.color } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(COLORS).map(([name, hex]) => (
        <button
          key={name}
          aria-label={name}
          onClick={() => onChange(name)}
          className={cx("size-6 rounded-full ring-offset-2 ring-offset-raise", value === name && "ring-2 ring-fg")}
          style={{ background: hex }}
        />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="grid place-items-center py-16 text-sm text-muted">{children}</div>;
}

export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4 md:px-6">
      {typeof title === "string" ? (
        <h1 className="truncate text-[22px] font-semibold tracking-tight">{title}</h1>
      ) : (
        <div role="heading" aria-level={1} className="flex min-w-0 flex-1 items-center truncate text-[22px] font-semibold tracking-tight">{title}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </header>
  );
}

/** Dayloop-style dropdown (replaces the native <select> popup): anchored listbox, keyboard and touch friendly. */
export function Select<T extends string | number>({
  value, options, onChange, label, placeholder, className, disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean } | null>(null);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  const show = () => {
    const r = btn.current!.getBoundingClientRect();
    const need = Math.min(options.length * 36 + 8, 280);
    const up = r.bottom + need + 8 > window.innerHeight && r.top > need;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: r.left, width: Math.max(r.width, 160), up });
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = () => { setOpen(false); btn.current?.focus(); };
  const pick = (i: number) => { onChange(options[i].value); close(); };

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const dismiss = () => setOpen(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) show();
            else setActive((a) => Math.max(0, Math.min(options.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
          } else if (open && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(active); }
          else if (open && e.key === "Escape") { e.stopPropagation(); close(); }
        }}
        className={cx(inputCls, "flex items-center justify-between gap-2 text-left disabled:opacity-50", className)}
      >
        <span className={cx("truncate", !current && "text-faint")}>{current?.label ?? placeholder ?? ""}</span>
        <ChevronDown size={15} className={cx("shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={list}
          role="listbox"
          aria-label={label}
          className="pop fixed z-[60] max-h-[280px] overflow-y-auto rounded-lg border border-line bg-raise p-1 shadow-xl"
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              onMouseMove={() => setActive(i)}
              onClick={() => pick(i)}
              className={cx("flex h-9 cursor-default items-center justify-between gap-2 rounded-md px-2.5 text-[13px]", i === active && "bg-hover", o.value === value && "font-medium text-accent")}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check size={14} />}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
