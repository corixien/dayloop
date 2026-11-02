import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 6 * 1024 * 1024;
const MAX_HOPS = 4;

/** Loopback, private, link-local and metadata ranges: never fetched on behalf of a user. */
export function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u: URL) {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad_url");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("blocked");
}

/** Podcast RSS feeds have no CORS headers: the app reads them through the server. Text only, size and hop limited. */
export async function fetchFeed(url: string): Promise<string> {
  let u = new URL(url);
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    await assertPublic(u);
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "Dayloop/1.0 (+podcast reader)", Accept: "application/rss+xml, application/xml, text/xml, */*" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = new URL(res.headers.get("location")!, u);
      continue;
    }
    if (!res.ok) throw new Error("upstream");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("upstream");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("too_large"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("redirects");
}
