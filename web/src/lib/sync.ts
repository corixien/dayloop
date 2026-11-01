import type { SyncResponse } from "@dayloop/shared";
import type { Local } from "./db";

export interface Session {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
}

export interface KV {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
}

export type SyncStatus = "signedout" | "idle" | "syncing" | "offline" | "error";

export class AuthError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

const SESSION_KEY = "dl_session";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Push dirty rows, pull everything after the cursor, keep a live SSE channel for server-side changes. */
export class SyncClient {
  status: SyncStatus = "signedout";
  session: Session | null = null;
  lastSyncAt = 0;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private sse: AbortController | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private local: Local,
    private kv: KV,
    private baseUrl = "",
    private doFetch: typeof fetch = (...a) => fetch(...a),
  ) {
    const raw = kv.get(SESSION_KEY);
    if (raw) {
      this.session = JSON.parse(raw);
      this.status = "idle";
    }
    local.onWrite = () => this.syncSoon();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  getSnapshot = () => this.status;
  private set(s: SyncStatus) {
    if (this.status === s) return;
    this.status = s;
    this.listeners.forEach((l) => l());
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, "");
  }
  get url() {
    return this.baseUrl;
  }

  // ---- auth ----

  private async authCall(path: string, body: unknown): Promise<any> {
    const res = await this.doFetch(this.baseUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new AuthError(json.error ?? "error", res.status);
    return json;
  }

  private async adopt(email: string, r: any) {
    const prevUser = await this.local.metaGet<string>("userId");
    if (prevUser && prevUser !== r.userId) await this.local.clear();
    if (prevUser !== r.userId) {
      await this.local.metaSet("userId", r.userId);
      await this.local.metaSet("cursor", 0);
      // data created while signed out becomes this account's data
      await this.local.markAllDirty();
    }
    this.session = {
      userId: r.userId, email, accessToken: r.accessToken, refreshToken: r.refreshToken,
      expiresAt: Date.now() + r.expiresIn * 1000 - 30_000,
    };
    this.kv.set(SESSION_KEY, JSON.stringify(this.session));
    this.set("idle");
    this.start();
    await this.syncNow();
  }

  async register(email: string, password: string) {
    await this.adopt(email, await this.authCall("/api/auth/register", { email, password }));
  }
  async login(email: string, password: string) {
    await this.adopt(email, await this.authCall("/api/auth/login", { email, password }));
  }

  async logout(wipe = true) {
    const rt = this.session?.refreshToken;
    this.stop();
    this.session = null;
    this.kv.remove(SESSION_KEY);
    this.set("signedout");
    if (rt) await this.authCall("/api/auth/logout", { refreshToken: rt }).catch(() => {});
    if (wipe) await this.local.clear();
  }

  private async token(): Promise<string> {
    const s = this.session;
    if (!s) throw new AuthError("signedout", 401);
    if (Date.now() < s.expiresAt) return s.accessToken;
    try {
      const r = await this.authCall("/api/auth/refresh", { refreshToken: s.refreshToken });
      this.session = { ...s, accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: Date.now() + r.expiresIn * 1000 - 30_000 };
      this.kv.set(SESSION_KEY, JSON.stringify(this.session));
      return r.accessToken;
    } catch (e) {
      if (e instanceof AuthError && e.status === 401 && e.code === "invalid_refresh") {
        await this.logout(false);
      }
      throw e;
    }
  }

  async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.doFetch(this.baseUrl + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${await this.token()}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new AuthError((json as any).error ?? "error", res.status);
    return json as T;
  }

  // ---- sync ----

  syncSoon(ms = 400) {
    if (!this.session) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.syncNow(), ms);
  }

  syncNow(): Promise<void> {
    if (!this.session) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.cycle()
      .then(async () => {
        while (this.again && this.session) {
          this.again = false;
          await this.cycle();
        }
      })
      .finally(() => {
        this.again = false;
        this.running = null;
      });
    return this.running;
  }

  private async cycle() {
    this.set("syncing");
    try {
      for (;;) {
        const dirty = await this.local.dirtyBatch();
        const cursor = (await this.local.metaGet<number>("cursor")) ?? 0;
        const res = await this.api<SyncResponse>("/api/sync", {
          method: "POST",
          body: JSON.stringify({ cursor, changes: dirty.map((r) => this.local.toChange(r)) }),
        });
        if (res.rejected.some((r) => r.reason === "invalid")) console.warn("sync: server rejected invalid items", res.rejected);
        await this.local.markPushed(dirty);
        await this.local.applyPulled(res.changes);
        await this.local.metaSet("cursor", res.cursor);
        if (!res.hasMore && dirty.length < 500) break;
      }
      this.lastSyncAt = Date.now();
      this.set("idle");
    } catch (e) {
      if (!this.session) return this.set("signedout");
      this.set(e instanceof AuthError && e.status >= 400 && e.status < 500 ? "error" : "offline");
    }
  }

  // ---- live channel ----

  start() {
    if (!this.session || this.sse) return;
    const ac = (this.sse = new AbortController());
    void this.listen(ac);
    this.poll = setInterval(() => void this.syncNow(), 60_000);
    if (typeof window !== "undefined") {
      window.addEventListener("online", this.kick);
      document.addEventListener("visibilitychange", this.kick);
    }
  }

  private kick = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") void this.syncNow();
  };

  stop() {
    this.sse?.abort();
    this.sse = null;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
    if (this.debounce) clearTimeout(this.debounce);
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.kick);
      document.removeEventListener("visibilitychange", this.kick);
    }
  }

  private async listen(ac: AbortController) {
    let backoff = 1000;
    while (!ac.signal.aborted) {
      try {
        const res = await this.doFetch(this.baseUrl + "/api/events", {
          headers: { Authorization: `Bearer ${await this.token()}` },
          signal: ac.signal,
        });
        if (!res.ok || !res.body) throw new Error("sse " + res.status);
        backoff = 1000;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (/^data:/m.test(dec.decode(value))) void this.syncNow();
        }
      } catch {
        if (ac.signal.aborted) return;
      }
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}
