/**
 * Productivity-Tracker integration: sends finished things to the tracker's own AI flow
 * (rate -> create task -> complete), so XP and streaks work exactly as if typed in there.
 * Credentials stay on this device (localStorage), they are never synced.
 */

export interface TrackerConfig {
  url: string;
  username: string;
  password: string;
}

const CFG = "dl_tracker";
const SENT = "dl_tracker_sent";

export function getTracker(): TrackerConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(CFG) ?? "null");
    return c?.url && c?.username && c?.password ? c : null;
  } catch {
    return null;
  }
}
export const saveTracker = (c: TrackerConfig) =>
  localStorage.setItem(CFG, JSON.stringify({ ...c, url: c.url.trim().replace(/\/+$/, "") }));
export const clearTracker = () => localStorage.removeItem(CFG);

export const sentIds = (): Set<string> => new Set(JSON.parse(localStorage.getItem(SENT) ?? "[]"));
export const markSent = (ids: string[]) =>
  localStorage.setItem(SENT, JSON.stringify([...sentIds(), ...ids].slice(-1000)));

export class TrackerError extends Error {
  constructor(public code: "network" | "auth" | "ai" | "rate" | "other", message: string) {
    super(message);
  }
}

export interface TrackerResult {
  name: string;
  duration: number;
  xp: number;
}

async function call(cfg: TrackerConfig, path: string, body: unknown, token?: string, doFetch: typeof fetch = fetch) {
  let res: Response;
  try {
    res = await doFetch(`${cfg.url}/api${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new TrackerError("network", "network");
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(json.error ?? json.message ?? res.status);
    if (res.status === 401 || res.status === 403) throw new TrackerError("auth", msg);
    if (res.status === 429) throw new TrackerError("rate", msg);
    if (path === "/groq") throw new TrackerError("ai", msg);
    throw new TrackerError("other", msg);
  }
  return json;
}

export const trackerLogin = async (cfg: TrackerConfig, doFetch?: typeof fetch): Promise<string> => {
  const r = await call(cfg, "/auth/login", { username: cfg.username, password: cfg.password }, undefined, doFetch);
  const token = r.token ?? r.data?.token;
  if (!token) throw new TrackerError("auth", "no token");
  return token;
};

/** Describe what was done; the tracker's AI rates it as one task, which is then created and completed. */
export async function sendToTracker(
  cfg: TrackerConfig, items: { title: string; notes?: string }[], language: "de" | "en", doFetch?: typeof fetch,
): Promise<TrackerResult> {
  const token = await trackerLogin(cfg, doFetch);
  const description = items.map((i) => `- ${i.title}${i.notes?.trim() ? ` (${i.notes.trim().split("\n")[0]})` : ""}`).join("\n").slice(0, 1900);
  const rating = await call(cfg, "/groq", { description, language }, token, doFetch);
  const created = await call(cfg, "/tasks", {
    name: String(rating.name ?? items[0].title).slice(0, 200),
    duration: Number(rating.duration) || 30,
    productivity: Number(rating.productivity) || 3,
    difficulty: Number(rating.difficulty) || 3,
    category: rating.category ?? "other",
    bonus: rating.bonus ? 1 : 0,
    money: 0,
  }, token, doFetch);
  const id = created.id ?? created.task?.id;
  if (!id) throw new TrackerError("other", "task not created");
  const done = await call(cfg, `/tasks/${id}/complete`, {}, token, doFetch);
  return { name: created.name ?? rating.name, duration: Number(rating.duration) || 30, xp: Number(done.xpEarned ?? done.xpChange ?? rating.xp ?? 0) };
}
