import { useSyncExternalStore } from "react";

/** One audio element for the whole app: playback continues when the page changes or the app goes to the background. */
export interface Track { src: string; title: string; /** blob: URL created for this track, revoked when replaced */ revoke?: boolean }
interface Snap { track: Track | null; playing: boolean; pos: number; dur: number; error: boolean }

let audio: HTMLAudioElement | null = null;
let snap: Snap = { track: null, playing: false, pos: 0, dur: 0, error: false };
const subs = new Set<() => void>();
const set = (p: Partial<Snap>) => { snap = { ...snap, ...p }; subs.forEach((f) => f()); };

function el(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  const sync = () => set({ playing: !audio!.paused && !audio!.ended, pos: audio!.currentTime, dur: Number.isFinite(audio!.duration) ? audio!.duration : 0 });
  for (const ev of ["play", "pause", "ended", "timeupdate", "loadedmetadata", "durationchange", "seeked"]) audio.addEventListener(ev, sync);
  audio.addEventListener("error", () => set({ error: true, playing: false }));
  audio.addEventListener("playing", () => set({ error: false }));
  const ms = "mediaSession" in navigator ? navigator.mediaSession : null;
  if (ms) {
    ms.setActionHandler("play", () => void audio!.play());
    ms.setActionHandler("pause", () => audio!.pause());
    ms.setActionHandler("seekbackward", () => player.skip(-15));
    ms.setActionHandler("seekforward", () => player.skip(15));
    ms.setActionHandler("seekto", (d) => { if (d.seekTime !== undefined && d.seekTime !== null) player.seek(d.seekTime); });
  }
  return audio;
}

export const player = {
  play(t: Track) {
    const a = el();
    if (snap.track?.revoke && snap.track.src !== t.src) URL.revokeObjectURL(snap.track.src);
    if (snap.track?.src === t.src) { void a.play(); return; }
    a.src = t.src;
    set({ track: t, pos: 0, dur: 0, error: false, playing: false });
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: "Dayloop" });
    a.play().catch(() => set({ playing: false }));
  },
  toggle() { const a = el(); if (a.paused) void a.play(); else a.pause(); },
  seek(sec: number) { const a = el(); a.currentTime = Math.max(0, Math.min(sec, a.duration || sec)); },
  skip(delta: number) { const a = el(); player.seek(a.currentTime + delta); },
  close() {
    const a = el();
    a.pause();
    if (snap.track?.revoke) URL.revokeObjectURL(snap.track.src);
    a.removeAttribute("src");
    a.load();
    set({ track: null, playing: false, pos: 0, dur: 0, error: false });
  },
};

const subscribe = (f: () => void) => { subs.add(f); return () => void subs.delete(f); };
export const usePlayer = () => useSyncExternalStore(subscribe, () => snap);
