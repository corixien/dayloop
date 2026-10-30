import { existsSync } from "node:fs";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { type ItemType, isItemType, syncRequestSchema, type Change } from "@dayloop/shared";
import { Auth, type AuthedRequest, hashPassword, verifyPassword } from "./auth.js";
import type { Db } from "./db.js";
import { Store } from "./store.js";

export interface AppOptions {
  db: Db;
  jwtSecret: string;
  allowRegistration?: boolean;
  /** directory with the built web app, served with SPA fallback */
  webDir?: string;
  /** disable rate limits (tests) */
  noLimits?: boolean;
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
});
const UUID = /^[0-9a-f-]{36}$/;

export function createApp(opts: AppOptions) {
  const { db } = opts;
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const store = new Store(db, (userId, seq) => events.emit(userId, seq));
  const auth = new Auth(db, opts.jwtSecret);
  const requireAuth = auth.middleware;

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  const authLimiter = opts.noLimits
    ? (_q: Request, _s: Response, n: NextFunction) => n()
    : rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false });

  const uid = (req: Request) => (req as AuthedRequest).userId;

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/auth/register", authLimiter, async (req, res) => {
    if (opts.allowRegistration === false) return void res.status(403).json({ error: "registration_closed" });
    const p = credentials.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: "invalid_credentials" });
    const hash = await hashPassword(p.data.password);
    const r = await db.query<{ id: string }>(
      "insert into users (email, pass_hash) values ($1,$2) on conflict (email) do nothing returning id",
      [p.data.email, hash],
    );
    if (!r.rows[0]) return void res.status(409).json({ error: "email_taken" });
    res.status(201).json({ userId: r.rows[0].id, ...(await auth.newSession(r.rows[0].id)) });
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    const p = credentials.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: "invalid_credentials" });
    const r = await db.query<{ id: string; pass_hash: string }>("select id, pass_hash from users where email=$1", [
      p.data.email,
    ]);
    const u = r.rows[0];
    const ok = u ? await verifyPassword(p.data.password, u.pass_hash) : false;
    if (!u || !ok) return void res.status(401).json({ error: "wrong_credentials" });
    res.json({ userId: u.id, ...(await auth.newSession(u.id)) });
  });

  app.post("/api/auth/refresh", authLimiter, async (req, res) => {
    const t = z.object({ refreshToken: z.string().min(10).max(200) }).safeParse(req.body);
    const s = t.success ? await auth.refresh(t.data.refreshToken) : null;
    if (!s) return void res.status(401).json({ error: "invalid_refresh" });
    res.json(s);
  });

  app.post("/api/auth/logout", async (req, res) => {
    const t = z.object({ refreshToken: z.string().max(200) }).safeParse(req.body);
    if (t.success) await auth.logout(t.data.refreshToken);
    res.json({ ok: true });
  });

  app.get("/api/me", requireAuth, async (req, res) => {
    const r = await db.query<{ email: string }>("select email from users where id=$1", [uid(req)]);
    res.json({ userId: uid(req), email: r.rows[0]?.email });
  });

  // API tokens (for Claude/MCP). Manageable only with a login session, never with an API token.
  const sessionOnly = (req: Request, res: Response, next: NextFunction) =>
    (req as AuthedRequest).viaApiToken ? void res.status(403).json({ error: "forbidden" }) : next();

  app.get("/api/tokens", requireAuth, sessionOnly, async (req, res) => {
    const r = await db.query(
      "select id, name, prefix, created_at, last_used_at from api_tokens where user_id=$1 order by created_at",
      [uid(req)],
    );
    res.json(r.rows);
  });

  app.post("/api/tokens", requireAuth, sessionOnly, async (req, res) => {
    const p = z.object({ name: z.string().trim().min(1).max(60) }).safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: "invalid_name" });
    res.status(201).json(await auth.createApiToken(uid(req), p.data.name));
  });

  app.delete("/api/tokens/:id", requireAuth, sessionOnly, async (req, res) => {
    if (!UUID.test(String(req.params.id))) return void res.status(404).json({ error: "not_found" });
    const r = await db.query("delete from api_tokens where id=$1 and user_id=$2 returning id", [
      req.params.id,
      uid(req),
    ]);
    res.status(r.rows[0] ? 200 : 404).json({ ok: !!r.rows[0] });
  });

  // Sync: push local changes, pull everything after the cursor.
  app.post("/api/sync", requireAuth, async (req, res) => {
    const p = syncRequestSchema.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: "invalid_request" });
    res.json(await store.sync(uid(req), p.data.cursor, p.data.changes as Change[]));
  });

  // Server-sent events: a ping with the new seq whenever the user's data changes (any client, MCP included).
  app.get("/api/events", requireAuth, (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    res.write("retry: 3000\n\n");
    const user = uid(req);
    const onChange = (seq: number) => res.write(`data: ${seq}\n\n`);
    events.on(user, onChange);
    const beat = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(beat);
      events.off(user, onChange);
    });
  });

  // Plain REST over the same store, used by the MCP server.
  const typeParam = (req: Request, res: Response): ItemType | null => {
    const t = req.params.type;
    if (isItemType(t)) return t;
    res.status(404).json({ error: "unknown_type" });
    return null;
  };

  app.get("/api/items", requireAuth, async (req, res) => {
    const t = req.query.type;
    if (t !== undefined && !isItemType(t)) return void res.status(400).json({ error: "unknown_type" });
    res.json(await store.list(uid(req), t as ItemType | undefined));
  });

  app.post("/api/items/:type", requireAuth, async (req, res) => {
    const type = typeParam(req, res);
    if (!type) return;
    const id = typeof req.body?.id === "string" ? req.body.id : randomUUID();
    const item = await store.put(uid(req), type, id, req.body?.data ?? {}, "replace");
    res.status(item ? 201 : 400).json(item ?? { error: "invalid_data" });
  });

  app.get("/api/items/:type/:id", requireAuth, async (req, res) => {
    const type = typeParam(req, res);
    if (!type) return;
    const item = await store.get(uid(req), type, String(req.params.id));
    res.status(item ? 200 : 404).json(item ?? { error: "not_found" });
  });

  app.patch("/api/items/:type/:id", requireAuth, async (req, res) => {
    const type = typeParam(req, res);
    if (!type) return;
    if (!(await store.get(uid(req), type, String(req.params.id)))) return void res.status(404).json({ error: "not_found" });
    const item = await store.put(uid(req), type, String(req.params.id), req.body?.data ?? {}, "merge");
    res.status(item ? 200 : 400).json(item ?? { error: "invalid_data" });
  });

  app.delete("/api/items/:type/:id", requireAuth, async (req, res) => {
    const type = typeParam(req, res);
    if (!type) return;
    const ok = await store.remove(uid(req), type, String(req.params.id));
    res.status(ok ? 200 : 404).json({ ok });
  });

  // Built web app (single deploy, same origin) with SPA fallback.
  if (opts.webDir && existsSync(join(opts.webDir, "index.html"))) {
    app.use(express.static(opts.webDir, { maxAge: "1h", index: false }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(opts.webDir!, "index.html")));
  }

  app.use("/api", (_req, res) => void res.status(404).json({ error: "not_found" }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "internal" });
  });

  return app;
}
