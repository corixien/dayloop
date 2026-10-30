import { Check, X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef } from "react";

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
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-line px-4 md:px-6">
      {typeof title === "string" ? (
        <h1 className="truncate text-[15px] font-semibold">{title}</h1>
      ) : (
        <div role="heading" aria-level={1} className="flex min-w-0 flex-1 items-center truncate text-[15px] font-semibold">{title}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </header>
  );
}
