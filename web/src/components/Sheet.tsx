import { type ReactNode, useRef, useState } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Bottom sheet: slides up, drag the handle area down (or fling) to dismiss. */
export function Sheet({ onClose, children, always }: { onClose: () => void; children: (close: () => void) => ReactNode; always?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef({ y0: 0, t0: 0, dy: 0, v: 0, lastY: 0, lastT: 0, on: false });

  const set = (dy: number, animate: boolean) => {
    if (panel.current) {
      panel.current.style.transition = animate ? `transform 280ms ${EASE}` : "none";
      panel.current.style.transform = `translateY(${dy}px)`;
    }
    if (back.current) {
      const h = panel.current?.offsetHeight ?? 600;
      back.current.style.transition = animate ? "opacity 280ms ease-out" : "none";
      back.current.style.opacity = String(Math.max(0, 1 - dy / h));
    }
  };

  const close = () => {
    if (closing) return;
    setClosing(true);
    set(panel.current?.offsetHeight ?? 800, true);
    setTimeout(onClose, 260);
  };

  const d = drag.current;
  return (
    <div className={always ? "fixed inset-0 z-30" : "fixed inset-0 z-30 md:hidden"}>
      <div ref={back} onClick={close} className={always ? "anim-fade absolute inset-0 bg-black/20" : "anim-fade absolute inset-0 bg-black/45"} />
      <div
        ref={panel}
        className={`anim-sheet absolute inset-x-0 bottom-0 flex ${always ? "h-[78dvh]" : "h-[92dvh]"} flex-col overflow-hidden rounded-t-2xl border-t border-line bg-bg shadow-2xl`}
      >
        <div
          className="flex h-8 shrink-0 touch-none items-center justify-center"
          onTouchStart={(e) => {
            const t = e.touches[0];
            Object.assign(d, { y0: t.clientY, dy: 0, v: 0, lastY: t.clientY, lastT: e.timeStamp, on: true });
            panel.current?.style.removeProperty("animation");
          }}
          onTouchMove={(e) => {
            if (!d.on) return;
            const t = e.touches[0];
            d.dy = Math.max(0, t.clientY - d.y0);
            const dt = e.timeStamp - d.lastT;
            if (dt > 0) d.v = (t.clientY - d.lastY) / dt;
            d.lastY = t.clientY; d.lastT = e.timeStamp;
            set(d.dy, false);
          }}
          onTouchEnd={() => {
            if (!d.on) return;
            d.on = false;
            if (d.dy > 140 || d.v > 0.6) close();
            else set(0, true);
          }}
        >
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>
        <div className="min-h-0 flex-1">{children(close)}</div>
      </div>
    </div>
  );
}
