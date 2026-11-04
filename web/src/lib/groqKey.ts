import { saveSettings } from "./app";
import { KEY, getGroqKey } from "./assistant";
import { type Settings } from "@dayloop/shared";
import { getTracker, saveTracker, sentIds, setSent } from "./tracker";

/** The key lives in the synced settings; localStorage is the copy the overlay and plain reads use. */
export const saveGroqKey = (k: string) => {
  k.trim() ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY);
  return saveSettings({ groqKey: k.trim() });
};
/** Bring settings and local copy together: synced value wins, an old device-only key is uploaded once. */
export function adoptGroqKey(synced: string) {
  const mine = getGroqKey();
  if (synced && synced !== mine) localStorage.setItem(KEY, synced);
  else if (!synced && mine) void saveSettings({ groqKey: mine });
}

/** Tracker login and sent marks: same two-way mirror between the synced settings and the device copy. */
export function adoptTracker(s: Settings) {
  const mine = getTracker();
  if (s.trackerUrl && (mine?.url !== s.trackerUrl || mine.username !== s.trackerUser || mine.password !== s.trackerPass)) {
    saveTracker({ url: s.trackerUrl, username: s.trackerUser, password: s.trackerPass });
  } else if (!s.trackerUrl && mine) void pushTracker();
  const local = sentIds();
  const merged = new Set([...local, ...s.trackerSent]);
  if (merged.size !== local.size) setSent([...merged]);
  if (merged.size !== s.trackerSent.length) void pushTracker();
}
export function pushTracker() {
  const t = getTracker();
  return saveSettings({ trackerUrl: t?.url ?? "", trackerUser: t?.username ?? "", trackerPass: t?.password ?? "", trackerSent: [...sentIds()].slice(-1000) });
}
