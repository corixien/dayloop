import { type ReactNode, useEffect, useRef } from "react";

const W = 290;
const EDGE = 26;
/** Dragging the menu this far past fully open counts as "pull further" (used for the quick search). */
const OVERPULL = 30;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Side panel that follows the finger: drag from its screen edge to open, drag back (or tap the dimmed area) to close.
 * Releases snap by distance or fling speed. The left one can be pulled a little further than open: `onOverpull`.
 * `blocked`: the other drawer is open, so an edge swipe must not open this one too.
 */
export function Drawer({ side = "left", open, onOpenChange, onOverpull, blocked, children }: {
  side?: "left" | "right"; open: boolean; onOpenChange: (o: boolean) => void; onOverpull?: () => void; blocked?: boolean; children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  const overRef = useRef(onOverpull);
  overRef.current = onOverpull;
  const dir = side === "left" ? 1 : -1;

  const setProgress = (p: number, animate: boolean, extra = 0) => {
    const pn = panel.current, bk = back.current;
    if (!pn || !bk) return;
    pn.style.transition = animate ? `transform 300ms ${EASE}` : "none";
    pn.style.transform = `translateX(calc(${(1 - p) * -dir * 100}% + ${extra * dir}px))`;
    bk.style.transition = animate ? `opacity 300ms ${EASE}` : "none";
    bk.style.opacity = String(p);
    bk.style.pointerEvents = p > 0.01 ? "auto" : "none";
    pn.style.boxShadow = p > 0.01 ? "0 0 40px rgba(0,0,0,0.35)" : "none";
    if (p > 0.01) pn.removeAttribute("inert");
    else if (animate) pn.setAttribute("inert", "");
  };

  useEffect(() => { setProgress(open ? 1 : 0, true); }, [open]);

  useEffect(() => {
    let mode: "idle" | "open" | "close" = "idle";
    let decided = false;
    let x0 = 0, y0 = 0, p = 0, v = 0, lastX = 0, lastT = 0, over = 0, buzzed = false;

    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      x0 = lastX = t.clientX; y0 = t.clientY; lastT = e.timeStamp;
      decided = false; v = 0; over = 0; buzzed = false;
      const atEdge = side === "left" ? t.clientX <= EDGE : t.clientX >= window.innerWidth - EDGE;
      mode = openRef.current ? "close" : atEdge && !blockedRef.current ? "open" : "idle";
    };
    const move = (e: TouchEvent) => {
      if (mode === "idle") return;
      const t = e.touches[0];
      const dx = (t.clientX - x0) * dir, dy = t.clientY - y0;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { mode = "idle"; return; }
        decided = true;
      }
      const raw = mode === "open" ? dx / W : 1 + dx / W;
      p = Math.max(0, Math.min(1, raw));
      // pulling past fully open: the panel stretches a little and, once far enough, the pull is armed
      over = overRef.current && raw > 1 ? (raw - 1) * W : 0;
      if (over >= OVERPULL && !buzzed) { buzzed = true; navigator.vibrate?.(12); }
      else if (over < OVERPULL) buzzed = false;
      const dt = e.timeStamp - lastT;
      if (dt > 0) v = ((t.clientX - lastX) * dir) / dt;
      lastX = t.clientX; lastT = e.timeStamp;
      setProgress(p, false, Math.min(over, OVERPULL) * 0.45);
    };
    const end = () => {
      if (mode === "idle" || !decided) { mode = "idle"; return; }
      const pulled = over >= OVERPULL;
      const next = pulled ? false : v > 0.45 ? true : v < -0.45 ? false : p > 0.5;
      mode = "idle";
      setProgress(next ? 1 : 0, true);
      onOpenChange(next);
      if (pulled) overRef.current?.();
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end, { passive: true });
    window.addEventListener("touchcancel", end, { passive: true });
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="md:hidden">
      <div ref={back} onClick={() => onOpenChange(false)} className="fixed inset-0 z-40 bg-black/45" style={{ opacity: 0, pointerEvents: "none" }} />
      <div
        ref={panel}
        inert
        className={`fixed inset-y-0 z-50 ${side === "left" ? "left-0 border-r" : "right-0 border-l"} border-line`}
        style={{ width: W, transform: `translateX(${-dir * 100}%)`, willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
}
