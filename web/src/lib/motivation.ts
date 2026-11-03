import Dexie, { type Table } from "dexie";
import { Capacitor } from "@capacitor/core";
import { syncClient } from "./app";
import { isNative } from "./native";
import { widgetPlugin } from "./widget";

export interface MText { id?: number; title: string; body: string; createdAt: number }
export interface MAudio { id?: number; name: string; blob: Blob; createdAt: number }
export interface MFeed { url: string; title: string; image: string; author: string }
/** An episode saved on this device: a file in the app folder (Android) or a blob (browser). */
export interface Download { id: string; title: string; feed: string; path?: string; blob?: Blob; size: number; createdAt: number }
export interface Episode { title: string; audio: string; date: number; duration: string }

/** Personal motivation material lives on this device only (audio files are too big to sync). */
class MotivationDb extends Dexie {
  texts!: Table<MText, number>;
  audios!: Table<MAudio, number>;
  feeds!: Table<MFeed, string>;
  downloads!: Table<Download, string>;
  constructor() {
    super("dayloop-motivation");
    this.version(1).stores({ texts: "++id, createdAt", audios: "++id, createdAt", feeds: "url" });
    this.version(2).stores({ downloads: "id, createdAt" });
  }
}
export const mdb = new MotivationDb();

/** Starter podcasts (public RSS feeds), one tap to add. */
export const SUGGESTED: MFeed[] = [
  { url: "https://rss.libsyn.com/shows/118129/destinations/680582.xml", title: "Foxi Mind", image: "", author: "Innere Stärke, Ziele erreichen" },
  { url: "https://anchor.fm/s/4825e5c0/podcast/rss", title: "Kopfsalat", image: "", author: "Motivation, Routinen, Psychologie" },
  { url: "https://rss.buzzsprout.com/340517.rss", title: "Audio Motivation", image: "", author: "David Lengauer" },
  { url: "https://letscast.fm/podcasts/stoizismus-heute-948fbfe3/feed", title: "Stoizismus heute", image: "", author: "Gelassenheit und Selbstdisziplin" },
  { url: "https://rss.buzzsprout.com/2036859.rss", title: "The Motivation Mindset", image: "", author: "Risa Williams (EN)" },
];

/** iTunes search is public and CORS-enabled; the result carries the RSS feed URL. */
export async function searchPodcasts(term: string, lang: string): Promise<MFeed[]> {
  const q = new URLSearchParams({ term, media: "podcast", limit: "15", country: lang === "de" ? "de" : "us" });
  const r = await fetch(`https://itunes.apple.com/search?${q}`);
  if (!r.ok) throw new Error("search");
  const j = (await r.json()) as { results: { collectionName: string; artistName: string; artworkUrl100?: string; feedUrl?: string }[] };
  return j.results.filter((x) => x.feedUrl).map((x) => ({ url: x.feedUrl!, title: x.collectionName, image: x.artworkUrl100 ?? "", author: x.artistName }));
}

const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? "";

export function parseFeed(xml: string): { title: string; image: string; episodes: Episode[] } {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("parse");
  const channel = doc.querySelector("channel");
  const image = channel?.getElementsByTagName("itunes:image")[0]?.getAttribute("href") ?? text(channel?.querySelector("image > url"));
  const episodes: Episode[] = [];
  for (const it of Array.from(doc.querySelectorAll("item"))) {
    const enc = it.querySelector("enclosure");
    const audio = enc?.getAttribute("url");
    if (!audio) continue;
    episodes.push({
      title: text(it.querySelector("title")),
      audio,
      date: Date.parse(text(it.querySelector("pubDate"))) || 0,
      duration: text(it.getElementsByTagName("itunes:duration")[0]),
    });
  }
  return { title: text(channel?.querySelector(":scope > title")), image, episodes };
}

export async function loadFeed(url: string) {
  return parseFeed(await syncClient.fetchText(`/api/feed?url=${encodeURIComponent(url)}`));
}

/** "3725" / "1:02:05" / "45:10" -> "1:02:05" style label */
export function fmtDuration(d: string): string {
  if (!d) return "";
  if (d.includes(":")) return d.replace(/^00:/, "");
  const s = Number(d);
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, "0")}` + ` h` : `${m} min`;
}


const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
export const downloadId = (audioUrl: string) => hash(audioUrl);

/** Save an episode for offline listening. Android downloads natively (no CORS limits); the browser needs a CORS-enabled host. */
export async function downloadEpisode(ep: Episode, feed: string): Promise<Download> {
  const id = downloadId(ep.audio);
  const ext = /\.(mp3|m4a|aac|ogg|opus|wav)(\?|$)/i.exec(ep.audio)?.[1]?.toLowerCase() ?? "mp3";
  let rec: Download;
  if (isNative()) {
    const r = await widgetPlugin().downloadFile({ url: ep.audio, name: `${id}.${ext}` });
    rec = { id, title: ep.title, feed, path: r.path, size: r.size, createdAt: Date.now() };
  } else {
    const res = await fetch(ep.audio);
    if (!res.ok) throw new Error("download");
    const blob = await res.blob();
    rec = { id, title: ep.title, feed, blob, size: blob.size, createdAt: Date.now() };
  }
  await mdb.downloads.put(rec);
  return rec;
}

export async function removeDownload(d: Download) {
  if (d.path) await widgetPlugin().deleteFile({ path: d.path }).catch(() => {});
  await mdb.downloads.delete(d.id);
}

/** Playable URL of a saved episode (the caller revokes blob URLs it creates). */
export const downloadSrc = (d: Download) => (d.path ? Capacitor.convertFileSrc(`file://${d.path}`) : URL.createObjectURL(d.blob!));

export const fmtSize = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);

/** Accepts a pasted RSS URL: read its title and make a feed entry. */
export async function feedFromUrl(url: string): Promise<MFeed> {
  const f = await loadFeed(url);
  return { url, title: f.title || url, image: f.image, author: "" };
}
