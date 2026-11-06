import { Pause, Play, RotateCcw, RotateCw, SkipForward, X } from "lucide-react";
import { usePlayer, player } from "../lib/player";
import { useT } from "../lib/app";
import { IconButton } from "./ui";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Control bar of the global audio player: stays visible on every page while something is loaded. */
export function MiniPlayer() {
  const t = useT();
  const p = usePlayer();
  if (!p.track) return null;
  return (
    <div className="shrink-0 border-t border-line bg-sub px-3 py-1.5" role="region" aria-label={p.track.title}>
      <div className="flex items-center gap-1">
        <span className={`min-w-0 flex-1 truncate px-1 text-xs font-medium ${p.error ? "text-danger" : ""}`}>{p.error ? t("mPlayErr") : p.track.title}</span>
        <IconButton label="-15" className="size-8" onClick={() => player.skip(-15)}><RotateCcw size={15} /></IconButton>
        <IconButton label={p.playing ? t("pause") : t("start")} className="size-9" onClick={() => player.toggle()}>{p.playing ? <Pause size={18} /> : <Play size={18} />}</IconButton>
        <IconButton label="+15" className="size-8" onClick={() => player.skip(15)}><RotateCw size={15} /></IconButton>
        {p.track.next && <IconButton label={t("skip")} className="size-8" onClick={() => void player.next()}><SkipForward size={15} /></IconButton>}
        <IconButton label={t("close")} className="size-8" onClick={() => player.close()}><X size={15} /></IconButton>
      </div>
      <div className="flex items-center gap-2 text-[10px] tabular-nums text-muted">
        <span className="w-9 text-right">{fmt(p.pos)}</span>
        <input type="range" min={0} max={Math.max(1, Math.floor(p.dur))} step={1} value={Math.min(Math.floor(p.pos), Math.max(1, Math.floor(p.dur)))} onChange={(e) => player.seek(Number(e.target.value))} aria-label="seek" className="h-4 min-w-0 flex-1 accent-[var(--accent)]" />
        <span className="w-9">{p.dur ? fmt(p.dur) : ""}</span>
      </div>
    </div>
  );
}
