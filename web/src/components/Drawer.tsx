import { type ReactNode, useEffect, useRef } from "react";

const W = 290;
const EDGE = 26;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Left menu that follows the finger: drag from the left edge to open, drag left (or tap the dimmed area) to close.
 * Releases snap by distance or fling speed.
 */
export function Drawer({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const setProgress = (p: number, animate: boolean) => {
    const pn = panel.current, bk = back.current;
    if (!pn || !bk) return;
    pn.style.transition = animate ? `transform 300ms ${EASE}` : "none";
    pn.style.transform = `translateX(${(p - 1) * 100}%)`;
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
    let x0 = 0, y0 = 0, t0 = 0, p = 0, v = 0, lastX = 0, lastT = 0;

    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      x0 = lastX = t.clientX; y0 = t.clientY; t0 = lastT = e.timeStamp;
      decided = false; v = 0;
      mode = openRef.current ? "close" : t.clientX <= EDGE ? "open" : "idle";
    };
    const move = (e: TouchEvent) => {
      if (mode === "idle") return;
      const t = e.touches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (!decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { mode = "idle"; return; }
        decided = true;
      }
      p = Math.max(0, Math.min(1, mode === "open" ? dx / W : 1 + dx / W));
      const dt = e.timeStamp - lastT;
      if (dt > 0) v = (t.clientX - lastX) / dt;
      lastX = t.clientX; lastT = e.timeStamp;
      setProgress(p, false);
    };
    const end = () => {
      if (mode === "idle" || !decided) { mode = "idle"; return; }
      const next = v > 0.45 ? true : v < -0.45 ? false : p > 0.5;
      mode = "idle";
      setProgress(next ? 1 : 0, true);
      onOpenChange(next);
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
        className="fixed inset-y-0 left-0 z-50 border-r border-line"
        style={{ width: W, transform: "translateX(-100%)", willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
}
