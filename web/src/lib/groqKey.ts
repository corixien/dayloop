import { saveSettings } from "./app";
import { KEY, getGroqKey } from "./assistant";

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
