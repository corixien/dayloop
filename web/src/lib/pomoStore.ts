import { useSyncExternalStore } from "react";
import { local, uid } from "./app";
import { type PomoState, type Phase, advance, elapsedSec, finished, initial, pause, phaseSec, remaining, start } from "./pomo";
import { notifyNow } from "./notify";
import { isNative } from "./native";
import { syncFocusNative } from "./pomoNative";
import type { Settings } from "@dayloop/shared";

const KEY = "dl_pomo";
const clampMin = (m: number) => Math.max(1, Math.min(240, m));
type Cfg = Settings;

let state: PomoState | null = null;
let cfg: Cfg | null = null;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let version = 0;

function load(c: Cfg): PomoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return initial(c);
}

function set(s: PomoState) {
  state = s;
  version++;
  localStorage.setItem(KEY, JSON.stringify(s));
  if (cfg) void syncFocusNative(s, cfg.language);
  subs.forEach((f) => f());
  if (s.status === "running" && !timer) timer = setInterval(tick, 250);
  if (s.status !== "running" && timer) { clearInterval(timer); timer = null; }
}

function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((d) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + d);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.2);
      o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.22);
    });
  } catch { /* no audio */ }
}

async function record(s: PomoState, completed: boolean, now: number) {
  const secs = elapsedSec(s, now);
  if (secs < 5) return;
  // the widget overlay and the app both run this timer: write a session only once
  const key = `${s.startedAt}:${s.phase}:${completed}`;
  if (localStorage.getItem("dl_pomo_rec") === key) return;
  localStorage.setItem("dl_pomo_rec", key);
  await local.put("pomodoro", uid(), {
    taskId: s.taskId, kind: s.phase === "work" ? "work" : "break", startedAt: s.startedAt ?? now,
    plannedSec: s.plannedSec, actualSec: Math.min(secs, s.plannedSec), completed,
  });
}

function tick() {
  if (!state || !cfg) return;
  const now = Date.now();
  if (!finished(state, now)) { version++; subs.forEach((f) => f()); return; }
  const done = state;
  void record({ ...done, status: "paused", remainingMs: 0 }, true, now);
  if (!isNative()) beep(); // on Android the alarm receiver rings and notifies, also when the app is closed
  if (!isNative()) notifyNow(done.phase === "work" ? "Fokus beendet" : "Pause vorbei", done.phase === "work" ? "Zeit für eine Pause." : "Weiter geht's.");
  set(advance(done, cfg, now, true));
}

export const pomo = {
  init(c: Cfg) {
    cfg = c;
    if (!state) set(load(c));
    else if (state.status === "idle" && !state.custom && state.remainingMs !== phaseSec(state.phase, c) * 1000) set(initial(c, state.phase, state.round, state.taskId));
    if (state?.status === "running" && !timer) timer = setInterval(tick, 250);
  },
  start: () => state && cfg && set(start(state, Date.now())),
  pause: () => state && set(pause(state, Date.now())),
  reset: () => state && cfg && set(initial(cfg, state.phase, state.round, state.taskId)),
  /** end the current phase early; a started work phase is recorded as not completed */
  skip() {
    if (!state || !cfg) return;
    const now = Date.now();
    void record(state, false, now);
    set(advance(state, cfg, now, false));
  },
  /** one focus round of a custom length; afterwards the normal break follows */
  setCustom(min: number) {
    if (!state || !cfg || state.status !== "idle") return;
    const sec = Math.round(clampMin(min) * 60);
    set({ ...initial(cfg, "work", state.round, state.taskId), plannedSec: sec, remainingMs: sec * 1000, custom: true });
  },
  setPhase(p: Phase) { if (state && cfg) set(initial(cfg, p, state.round, state.taskId)); },
  setTask(id: string | null) { if (state) set({ ...state, taskId: id }); },
  focusTask(id: string) {
    if (!state || !cfg) return;
    set(start({ ...initial(cfg, "work", state.round, id) }, Date.now()));
  },
};

export function usePomo(): { state: PomoState | null; left: number } {
  useSyncExternalStore((f) => { subs.add(f); return () => void subs.delete(f); }, () => version);
  return { state, left: state ? remaining(state, Date.now()) : 0 };
}

// Another WebView (the widget overlay) may have changed the timer while this one was in the background.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !cfg) return;
  const raw = localStorage.getItem(KEY);
  if (raw && raw !== JSON.stringify(state)) {
    try { set(JSON.parse(raw)); } catch { /* keep current */ }
  }
});
