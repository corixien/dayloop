import type { Settings } from "@dayloop/shared";

export type Phase = "work" | "break" | "long";
export type Status = "idle" | "running" | "paused";

export interface PomoState {
  phase: Phase;
  status: Status;
  /** epoch ms the running phase ends */
  endsAt: number | null;
  remainingMs: number;
  plannedSec: number;
  startedAt: number | null;
  taskId: string | null;
  /** work sessions completed in the current cycle */
  round: number;
}

type Cfg = Pick<Settings, "workMin" | "breakMin" | "longBreakMin" | "longBreakEvery" | "autoStart">;

export const phaseSec = (p: Phase, c: Cfg) => 60 * (p === "work" ? c.workMin : p === "break" ? c.breakMin : c.longBreakMin);

export function initial(c: Cfg, phase: Phase = "work", round = 0, taskId: string | null = null): PomoState {
  const sec = phaseSec(phase, c);
  return { phase, status: "idle", endsAt: null, remainingMs: sec * 1000, plannedSec: sec, startedAt: null, taskId, round };
}

export function start(s: PomoState, now: number): PomoState {
  if (s.status === "running") return s;
  return { ...s, status: "running", endsAt: now + s.remainingMs, startedAt: s.startedAt ?? now };
}

export function pause(s: PomoState, now: number): PomoState {
  if (s.status !== "running") return s;
  return { ...s, status: "paused", endsAt: null, remainingMs: Math.max(0, s.endsAt! - now) };
}

export const remaining = (s: PomoState, now: number) => (s.status === "running" ? Math.max(0, s.endsAt! - now) : s.remainingMs);
export const finished = (s: PomoState, now: number) => s.status === "running" && now >= s.endsAt!;
export const elapsedSec = (s: PomoState, now: number) => Math.round((s.plannedSec * 1000 - remaining(s, now)) / 1000);

/** State after a phase ended (or was skipped): work -> break/long, break -> work. Auto-start runs it right away. */
export function advance(s: PomoState, c: Cfg, now: number, completed: boolean): PomoState {
  let round = s.round;
  let phase: Phase;
  if (s.phase === "work") {
    if (completed) round++;
    phase = c.longBreakEvery > 0 && round > 0 && round % c.longBreakEvery === 0 && completed ? "long" : "break";
  } else {
    phase = "work";
    if (s.phase === "long") round = 0;
  }
  const next = initial(c, phase, round, s.taskId);
  return c.autoStart ? start(next, now) : next;
}
