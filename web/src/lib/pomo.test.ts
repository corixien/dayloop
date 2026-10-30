import { describe, expect, it } from "vitest";
import { advance, elapsedSec, finished, initial, pause, remaining, start } from "./pomo";

const cfg = { workMin: 25, breakMin: 5, longBreakMin: 15, longBreakEvery: 4, autoStart: false };

describe("pomodoro", () => {
  it("defaults to 25 min work", () => {
    const s = initial(cfg);
    expect(s.remainingMs).toBe(25 * 60_000);
    expect(s.status).toBe("idle");
  });
  it("runs, pauses and resumes without drift", () => {
    let s = start(initial(cfg), 1_000);
    expect(remaining(s, 61_000)).toBe(25 * 60_000 - 60_000);
    s = pause(s, 61_000);
    expect(remaining(s, 999_999)).toBe(24 * 60_000);
    s = start(s, 2_000_000);
    expect(s.endsAt).toBe(2_000_000 + 24 * 60_000);
    expect(finished(s, s.endsAt!)).toBe(true);
    expect(finished(s, s.endsAt! - 1)).toBe(false);
    expect(elapsedSec(pause(start(initial(cfg), 0), 90_000), 0)).toBe(90);
  });
  it("cycles work -> break -> work and a long break after 4 sessions", () => {
    let s = initial(cfg);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      s = advance(s, cfg, 0, true);
      seen.push(s.phase);
      s = advance(s, cfg, 0, true);
    }
    expect(seen).toEqual(["break", "break", "break", "long"]);
    expect(s.phase).toBe("work");
    expect(s.round).toBe(0);
  });
  it("skipped work does not count; auto start runs next phase", () => {
    const s = advance(initial(cfg), cfg, 5, false);
    expect(s.round).toBe(0);
    const a = advance(initial({ ...cfg, autoStart: true }), { ...cfg, autoStart: true }, 5, true);
    expect(a.status).toBe("running");
    expect(a.phase).toBe("break");
    expect(a.plannedSec).toBe(300);
  });
});
