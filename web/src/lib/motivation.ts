import Dexie, { type Table } from "dexie";
import { Capacitor } from "@capacitor/core";
import { local, syncClient, uid, useItems } from "./app";
import { isNative } from "./native";
import { widgetPlugin } from "./widget";

export interface MText { id?: string; title: string; body: string; createdAt: number }
export interface MAudio { id: string; name: string; size: number; mime: string; createdAt: number }
export interface MFeed { url: string; title: string; image: string; author: string }
/** An episode saved on this device: a file in the app folder (Android) or a blob (browser). */
export interface Download { id: string; title: string; feed: string; path?: string; blob?: Blob; size: number; createdAt: number }
export interface Episode { title: string; audio: string; date: number; duration: string }

/**
 * Texts, subscribed podcasts and the audio list are synced items (motext, mofeed, moaudio); audio files go to the server as
 * blobs. This db holds the device-local parts: the file cache with an upload flag, downloaded episodes, and the pre-sync tables
 * (texts/audios/feeds) that `migrateMotivation` moves into the synced store once.
 */
interface OldAudio { id?: number; name: string; blob: Blob; createdAt: number }
interface AudioFile { id: string; blob: Blob; uploaded: 0 | 1 }
class MotivationDb extends Dexie {
  texts!: Table<{ id?: number; title: string; body: string; createdAt: number }, number>;
  audios!: Table<OldAudio, number>;
  feeds!: Table<MFeed, string>;
  downloads!: Table<Download, string>;
  files!: Table<AudioFile, string>;
  constructor() {
    super("dayloop-motivation");
    this.version(1).stores({ texts: "++id, createdAt", audios: "++id, createdAt", feeds: "url" });
    this.version(2).stores({ downloads: "id, createdAt" });
    this.version(3).stores({ files: "id" });
  }
}
export const mdb = new MotivationDb();

// ---- synced texts, feeds, audio ----

export function useTexts(): MText[] {
  return useItems("motext").map((x) => ({ id: x.id, title: x.title, body: x.body, createdAt: x.createdAt })).sort((a, b) => b.createdAt - a.createdAt);
}
export const saveText = (t: { id?: string; title: string; body: string; createdAt?: number }) =>
  local.put("motext", t.id ?? uid(), { title: t.title, body: t.body, createdAt: t.createdAt ?? Date.now() });
export const deleteText = (id: string) => local.remove("motext", id);

export const feedId = (url: string) => hash(url);
export const useFeeds = (): MFeed[] => useItems("mofeed");
export const subscribe = (f: MFeed) => local.put("mofeed", feedId(f.url), f);
export const unsubscribe = (url: string) => local.remove("mofeed", feedId(url));

export const useAudios = (): MAudio[] => useItems("moaudio").sort((a, b) => b.createdAt - a.createdAt);

/** Add an audio file: kept on the device right away, uploaded when possible (retried by `flushUploads`). */
export async function addAudio(f: File) {
  const id = uid();
  await mdb.files.put({ id, blob: f, uploaded: 0 });
  await local.put("moaudio", id, { name: f.name.replace(/\.[^.]+$/, ""), size: f.size, mime: f.type || "audio/mpeg", createdAt: Date.now() });
  void flushUploads();
}
export async function removeAudio(id: string) {
  await local.remove("moaudio", id);
  await mdb.files.delete(id);
  if (syncClient.session) void syncClient.blob(id, { method: "DELETE" }).catch(() => {});
}
let flushing = false;
export async function flushUploads() {
  if (flushing || !syncClient.session) return;
  flushing = true;
  try {
    for (const f of await mdb.files.where("uploaded").equals(0).toArray()) {
      const r = await syncClient.blob(f.id, { method: "PUT", body: f.blob });
      if (r.ok) await mdb.files.update(f.id, { uploaded: 1 });
    }
  } catch { /* offline: retried on the next sync */ } finally { flushing = false; }
}
/** The audio file: from the device cache, else downloaded from the server and cached. */
export async function audioBlob(a: MAudio): Promise<Blob> {
  const have = await mdb.files.get(a.id);
  if (have) return have.blob;
  const r = await syncClient.blob(a.id, { method: "GET" });
  if (!r.ok) throw new Error("audio");
  const blob = new Blob([await r.arrayBuffer()], { type: a.mime });
  await mdb.files.put({ id: a.id, blob, uploaded: 1 });
  return blob;
}

/** One-time move of the old device-only data into the synced store (idempotent: ids derive from the old rows). */
export async function migrateMotivation() {
  for (const x of await mdb.texts.toArray()) {
    await local.put("motext", `old${x.id}`, { title: x.title, body: x.body, createdAt: x.createdAt });
    await mdb.texts.delete(x.id!);
  }
  for (const f of await mdb.feeds.toArray()) { await subscribe(f); await mdb.feeds.delete(f.url); }
  for (const a of await mdb.audios.toArray()) {
    const id = `old${a.id}`;
    await mdb.files.put({ id, blob: a.blob, uploaded: 0 });
    await local.put("moaudio", id, { name: a.name, size: a.blob.size, mime: a.blob.type || "audio/mpeg", createdAt: a.createdAt });
    await mdb.audios.delete(a.id!);
  }
  void flushUploads();
}

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
