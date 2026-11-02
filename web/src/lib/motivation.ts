import Dexie, { type Table } from "dexie";
import { syncClient } from "./app";

export interface MText { id?: number; title: string; body: string; createdAt: number }
export interface MAudio { id?: number; name: string; blob: Blob; createdAt: number }
export interface MFeed { url: string; title: string; image: string; author: string }
export interface Episode { title: string; audio: string; date: number; duration: string }

/** Personal motivation material lives on this device only (audio files are too big to sync). */
class MotivationDb extends Dexie {
  texts!: Table<MText, number>;
  audios!: Table<MAudio, number>;
  feeds!: Table<MFeed, string>;
  constructor() {
    super("dayloop-motivation");
    this.version(1).stores({ texts: "++id, createdAt", audios: "++id, createdAt", feeds: "url" });
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
