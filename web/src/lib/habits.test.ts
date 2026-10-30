import { describe, expect, it } from "vitest";
import { habitStats } from "./habits";

const h = { days: [0, 1, 2, 3, 4, 5, 6], startDate: "2026-10-01", target: 1 };
const map = (...d: string[]) => new Map(d.map((x) => [x, 1]));

describe("habit stats", () => {
  it("counts the running streak, today not yet done keeps it alive", () => {
    const c = map("2026-10-26", "2026-10-27", "2026-10-28");
    expect(habitStats(h, c, "2026-10-29").current).toBe(3);
    expect(habitStats(h, c, "2026-10-28").current).toBe(3);
    expect(habitStats(h, c, "2026-10-30").current).toBe(0);
  });
  it("best streak, total and inactive days", () => {
    const c = map("2026-10-05", "2026-10-06", "2026-10-07", "2026-10-09");
    const s = habitStats(h, c, "2026-10-10");
    expect(s.best).toBe(3);
    expect(s.total).toBe(4);
    const weekdays = { ...h, days: [1, 2, 3, 4, 5] };
    // Fri 2026-10-23, (weekend skipped), Mon 26, Tue 27
    expect(habitStats(weekdays, map("2026-10-23", "2026-10-26", "2026-10-27"), "2026-10-27").current).toBe(3);
  });
  it("needs target completions per day", () => {
    const m = new Map([["2026-10-28", 2], ["2026-10-29", 3]]);
    expect(habitStats({ ...h, target: 3 }, m, "2026-10-29").current).toBe(1);
  });
});
