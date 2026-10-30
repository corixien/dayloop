import { useEffect } from "react";

interface Opts {
  /** horizontal distance in px that counts as a swipe */
  threshold?: number;
  /** only start when the touch begins this close to the left screen edge */
  fromLeftEdge?: number;
  /** ignore touches starting this close to the left edge (reserved for the menu swipe) */
  ignoreLeftEdge?: number;
  onLeft?: () => void;
  onRight?: () => void;
  enabled?: boolean;
}

/** Horizontal swipe detector on an element (or window). Vertical-dominant moves are ignored so lists still scroll. */
export function useSwipe(target: () => HTMLElement | Window | null, o: Opts, deps: unknown[] = []) {
  useEffect(() => {
    const el = target();
    if (!el || o.enabled === false) return;
    let x0 = 0, y0 = 0, active = false;
    const start = (e: Event) => {
      const t = (e as TouchEvent).touches[0];
      x0 = t.clientX;
      y0 = t.clientY;
      active = (o.fromLeftEdge === undefined || x0 <= o.fromLeftEdge) && (o.ignoreLeftEdge === undefined || x0 > o.ignoreLeftEdge);
    };
    const end = (e: Event) => {
      if (!active) return;
      active = false;
      const t = (e as TouchEvent).changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) < (o.threshold ?? 60) || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      (dx > 0 ? o.onRight : o.onLeft)?.();
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.enabled, ...deps]);
}
