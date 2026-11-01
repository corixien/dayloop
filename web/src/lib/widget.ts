import { registerPlugin } from "@capacitor/core";
import { useEffect } from "react";
import { local, syncClient, useSettings } from "./app";
import { isNative } from "./native";
import { toggleDone } from "./tasks";
import { TRACKER_EVENT, getTracker, sentIds } from "./tracker";
import { buildSnapshot } from "./widgetSnapshot";

export * from "./widgetSnapshot";

interface WidgetPlugin {
  overlayReady(): Promise<void>;
  update(snapshot: object): Promise<void>;
  setCredentials(o: { url: string; token: string }): Promise<void>;
  takePending(): Promise<{ actions: { id: string; done: boolean; at: number }[] }>;
  finishOverlay(): Promise<void>;
  openApp(): Promise<void>;
  focusSync(o: object): Promise<void>;
  listSounds(): Promise<{ sounds: { title: string; uri: string; kind: string }[] }>;
  playSound(o: { uri: string }): Promise<void>;
  stopSound(): Promise<void>;
  keepAwake(o: { on: boolean }): Promise<void>;
  pinWidget(): Promise<{ supported: boolean }>;
}
export const widgetPlugin = () => registerPlugin<WidgetPlugin>("DayloopWidget");

const TOKEN_KEY = "dl_widget_token";

/** The widget talks to the server on its own (tick a todo without opening the app) with a dedicated API token. */
async function ensureCredentials() {
  const w = widgetPlugin();
  const s = syncClient.session;
  if (!s) {
    if (localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      await w.setCredentials({ url: "", token: "" });
    }
    return;
  }
  const have = JSON.parse(localStorage.getItem(TOKEN_KEY) ?? "null") as { userId: string; token: string } | null;
  if (have?.userId === s.userId) return;
  const r = await syncClient.api<{ token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name: "Android Widget" }) });
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ userId: s.userId, token: r.token }));
  await w.setCredentials({ url: syncClient.url, token: r.token });
}

/** Completions made in the widget while the server was unreachable (or for repeating todos) are applied here. */
export async function applyPendingWidgetActions() {
  const { actions } = await widgetPlugin().takePending();
  for (const a of actions) {
    const task = await local.get("task", a.id);
    if (!task || task.done === a.done) continue;
    if (a.done && task.repeat) await toggleDone(task);
    else await local.patch("task", a.id, { done: a.done, completedAt: a.done ? a.at : null });
  }
}

/** Native only: keep the home screen widget in step with the data and apply what was done in it. */
export function useWidgetSync() {
  const lang = useSettings().language;
  useEffect(() => {
    if (!isNative()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await widgetPlugin().update(buildSnapshot(await local.all("task"), lang, new Date(), getTracker() ? { sent: sentIds() } : null));
          await ensureCredentials();
        } catch (e) {
          console.warn("widget sync", e);
        }
      }, 700);
    };
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      void applyPendingWidgetActions().then(push).catch(() => {});
    };
    local.db.items.hook("creating", push);
    local.db.items.hook("updating", push);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener(TRACKER_EVENT, push);
    resume();
    push();
    const day = setInterval(push, 15 * 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(day);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener(TRACKER_EVENT, push);
      local.db.items.hook("creating").unsubscribe(push);
      local.db.items.hook("updating").unsubscribe(push);
    };
  }, [lang]);
}

/** The overlay route has rendered: the native window may show its WebView. */
export function overlayReady() {
  void widgetPlugin().overlayReady().catch(() => {});
}

/** Close the translucent overlay activity (opened from the widget) after pushing pending changes. */
export async function closeOverlay() {
  await Promise.race([syncClient.syncNow(), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  try {
    await widgetPlugin().finishOverlay();
  } catch {
    history.back();
  }
}

const OPEN_KEY = "dl_open";

/** From the overlay: hand a route (and optionally a task to focus) to the main app, bring it up, close the overlay. */
export async function openInApp(route: string, focusTaskId?: string) {
  localStorage.setItem(OPEN_KEY, JSON.stringify({ route, focusTaskId }));
  try {
    await widgetPlugin().openApp();
  } catch {
    history.back();
  }
}

/** Main app: apply what the overlay asked for. Returns the route to go to, if any. */
export function takeOpenRequest(): { route: string; focusTaskId?: string } | null {
  const raw = localStorage.getItem(OPEN_KEY);
  if (!raw) return null;
  localStorage.removeItem(OPEN_KEY);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
