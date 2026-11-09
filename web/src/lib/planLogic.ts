/** Pure helpers for the Plan page (time blocks of one day). Times are "HH:MM", minutes are 0..1439. */

export const DAY_MIN = 1440;
export const toMin = (hm: string): number => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
export const fromMin = (m: number): string => {
  const c = Math.max(0, Math.min(DAY_MIN - 1, Math.round(m)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

export interface Block { id: string; title: string; notes: string; date: string; start: string; end: string }

export const byStart = <T extends { start: string; end: string }>(a: T, b: T) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end);

/**
 * Default start of a new block: right after the last block that ends at or before "now" or, if nothing is planned later,
 * the current time (rounded down to 5 min). Looking at another day: after its last block, else 08:00.
 */
export function nextStart(blocks: { start: string; end: string }[], nowMin: number | null): string {
  const lastEnd = blocks.reduce((m, b) => Math.max(m, toMin(b.end)), -1);
  if (nowMin === null) return fromMin(lastEnd >= 0 ? lastEnd : 8 * 60);
  const now = Math.floor(nowMin / 5) * 5;
  return fromMin(Math.max(lastEnd, now));
}

/** End of a new block: one hour after the start, clamped to the end of the day. */
export const defaultEnd = (start: string, minutes = 60): string => fromMin(Math.min(toMin(start) + minutes, DAY_MIN - 1));

/**
 * Overlapping blocks are not placed side by side: each one gets a depth (0 = nothing before it overlaps) and is drawn
 * full width with a small indent per level, later blocks on top. minLen: shortest length a block counts as (minutes), so
 * blocks drawn at a minimum height that collide with the next one are indented too.
 */
export function stack<T extends { start: string; end: string }>(sorted: T[], minLen = 1): { b: T; depth: number }[] {
  const ends: number[] = [];
  return sorted.map((b) => {
    const s = toMin(b.start);
    let depth = ends.findIndex((e) => e <= s);
    if (depth < 0) depth = ends.length;
    ends[depth] = Math.max(toMin(b.end), s + minLen);
    return { b, depth };
  });
}

/** Problem with a start/end pair, or null when valid. */
export const checkRange = (start: string, end: string): "format" | "order" | null => {
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!re.test(start) || !re.test(end)) return "format";
  return toMin(end) > toMin(start) ? null : "order";
};
