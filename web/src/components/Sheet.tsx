import { type ReactNode, useRef, useState } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Bottom sheet: slides up, drag the handle area down (or fling) to dismiss. With `onExpand`, dragging it up grows it and hands over. */
export function Sheet({ onClose, children, always, fit, onExpand }: { onClose: () => void; children: (close: () => void) => ReactNode; always?: boolean; fit?: boolean; onExpand?: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const drag = useRef({ y0: 0, t0: 0, dy: 0, v: 0, lastY: 0, lastT: 0, on: false });

  const set = (dy: number, animate: boolean) => {
    if (dy < 0 && panel.current) {
      // pulled up: the sheet grows towards the top of the screen
      panel.current.style.transition = animate ? `height 220ms ${EASE}` : "none";
      panel.current.style.height = `min(calc(78dvh + ${-dy}px), 100dvh)`;
      return;
    }
    if (panel.current) {
      panel.current.style.removeProperty("height");
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
      <div ref={back} onClick={close} className={always ? "absolute inset-0" : "anim-fade absolute inset-0 bg-black/45"} />
      <div
        ref={panel}
        className={`anim-sheet absolute inset-x-0 bottom-0 flex ${always ? (fit ? "max-h-[78dvh]" : "h-[78dvh]") : "h-[92dvh]"} flex-col overflow-hidden rounded-t-2xl border-t border-line bg-bg shadow-[0_-8px_40px_rgba(0,0,0,0.35)]`}
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
            d.dy = onExpand ? t.clientY - d.y0 : Math.max(0, t.clientY - d.y0);
            const dt = e.timeStamp - d.lastT;
            if (dt > 0) d.v = (t.clientY - d.lastY) / dt;
            d.lastY = t.clientY; d.lastT = e.timeStamp;
            set(d.dy, false);
          }}
          onTouchEnd={() => {
            if (!d.on) return;
            d.on = false;
            if (onExpand && (d.dy < -90 || d.v < -0.6) && d.dy < 0) {
              if (panel.current) { panel.current.style.transition = `height 200ms ${EASE}`; panel.current.style.height = "100dvh"; }
              setTimeout(onExpand, 180);
            } else if (d.dy > 140 || d.v > 0.6) close();
            else set(0, true);
          }}
        >
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children(close)}</div>
      </div>
    </div>
  );
}
