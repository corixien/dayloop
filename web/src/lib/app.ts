import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { type ItemType, type Settings, parseData } from "@dayloop/shared";
import { type Item, Local } from "./db";
import { type Key, type Lang, detectLang, translate } from "./i18n";
import { SyncClient } from "./sync";

const kv = {
  get: (k: string) => localStorage.getItem(k),
  set: (k: string, v: string) => localStorage.setItem(k, v),
  remove: (k: string) => localStorage.removeItem(k),
};

export const local = new Local("dayloop");
export const syncClient = new SyncClient(
  local,
  kv,
  (localStorage.getItem("dl_server") ?? (import.meta.env.VITE_API_URL as string | undefined) ?? "").replace(/\/+$/, ""),
);

export const uid = () => crypto.randomUUID();

export function useItems<T extends ItemType>(type: T): Item<T>[] {
  return useLiveQuery(() => local.all(type), [type], []) as Item<T>[];
}

export function useSettings(): Settings {
  const rows = useItems("settings");
  const stored = rows[0];
  return stored ?? parseData("settings", { language: detectLang() });
}

export async function saveSettings(patch: Partial<Settings>) {
  const rows = await local.all("settings");
  await local.put("settings", "settings", { ...(rows[0] ?? { language: detectLang() }), ...patch });
}

export function useT() {
  const lang: Lang = useSettings().language;
  return useCallback((key: Key) => translate(lang, key), [lang]);
}

export function useLang(): Lang {
  return useSettings().language;
}

export function useSyncStatus() {
  return useSyncExternalStore(syncClient.subscribe, syncClient.getSnapshot);
}

/** Re-renders every minute so "today" / overdue stay correct. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function useTheme(theme: Settings["theme"]) {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101012" : "#ffffff");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

export function useHashRoute(): [string, (r: string) => void] {
  const get = () => location.hash.replace(/^#/, "") || "/todo";
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => setRoute(get());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (r) => void (location.hash = r)];
}

/** Phone-sized layout (matches Tailwind md breakpoint). */
export function useIsMobile(): boolean {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}
