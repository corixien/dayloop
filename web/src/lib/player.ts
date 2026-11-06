import { useSyncExternalStore } from "react";
import { isNative } from "./native";
import { widgetPlugin } from "./widget";

/** One audio element for the whole app: playback continues when the page changes or the app goes to the background. */
export interface Track {
  src: string;
  title: string;
  /** blob: URL created for this track, revoked when replaced */
  revoke?: boolean;
  /** the track that follows (playlist / episode list); played automatically when this one ends */
  next?: () => Promise<Track | null>;
}
interface Snap { track: Track | null; playing: boolean; pos: number; dur: number; error: boolean }

let audio: HTMLAudioElement | null = null;
let snap: Snap = { track: null, playing: false, pos: 0, dur: 0, error: false };
const subs = new Set<() => void>();
let lastKey = "";
/** Android: mirror the state into the system media notification (and tell it when playback is over). */
function pushNative(force = false) {
  if (!isNative()) return;
  const { track, playing, pos, dur } = snap;
  if (!track) {
    if (lastKey) { lastKey = ""; void widgetPlugin().mediaClear().catch(() => {}); }
    return;
  }
  const key = `${track.src}|${playing}|${!!track.next}|${Math.round(dur)}`;
  if (key === lastKey && !force) return;
  lastKey = key;
  void widgetPlugin().mediaSync({ title: track.title, playing, pos: Math.round(pos * 1000), dur: Math.round(dur * 1000), hasNext: !!track.next }).catch(() => {});
}
const set = (p: Partial<Snap>) => { snap = { ...snap, ...p }; subs.forEach((f) => f()); };

function el(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  const sync = (e?: Event) => {
    set({ playing: !audio!.paused && !audio!.ended, pos: audio!.currentTime, dur: Number.isFinite(audio!.duration) ? audio!.duration : 0 });
    if (e?.type !== "timeupdate") pushNative(e?.type === "seeked");
  };
  for (const ev of ["play", "pause", "ended", "timeupdate", "loadedmetadata", "durationchange", "seeked"]) audio.addEventListener(ev, sync);
  audio.addEventListener("ended", () => void player.next());
  if (isNative()) {
    void widgetPlugin().addListener("mediaAction", (d: { action: string; value: number }) => {
      const a = audio!;
      if (d.action === "toggle") player.toggle();
      else if (d.action === "play") void a.play();
      else if (d.action === "pause") a.pause();
      else if (d.action === "ff") player.skip(15);
      else if (d.action === "rew") player.skip(-15);
      else if (d.action === "next") void player.next();
      else if (d.action === "seek") player.seek(d.value);
      else if (d.action === "stop") player.close();
    });
  }
  audio.addEventListener("error", () => set({ error: true, playing: false }));
  audio.addEventListener("playing", () => set({ error: false }));
  const ms = "mediaSession" in navigator ? navigator.mediaSession : null;
  if (ms) {
    ms.setActionHandler("play", () => void audio!.play());
    ms.setActionHandler("pause", () => audio!.pause());
    ms.setActionHandler("seekbackward", () => player.skip(-15));
    ms.setActionHandler("seekforward", () => player.skip(15));
    ms.setActionHandler("nexttrack", () => void player.next());
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
  async next() {
    const n = await snap.track?.next?.();
    if (n) player.play(n);
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
    pushNative();
  },
};

const subscribe = (f: () => void) => { subs.add(f); return () => void subs.delete(f); };
export const usePlayer = () => useSyncExternalStore(subscribe, () => snap);
