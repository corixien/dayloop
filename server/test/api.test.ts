import { PGlite } from "@electric-sql/pglite";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { type Db, migrate } from "../src/db.js";

function pgliteDb(): Db {
  const pg = new PGlite();
  const wrap = (q: { query: PGlite["query"] }) => ({
    query: async (sql: string, params?: unknown[]) => ({ rows: (await q.query(sql, params as any[])).rows as any[] }),
  });
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t as any))),
    close: () => pg.close(),
  };
}

let db: Db;
let api: ReturnType<typeof request>;
let events: Parameters<typeof request>[0];

beforeAll(async () => {
  db = pgliteDb();
  await migrate(db);
  const app = createApp({ db, jwtSecret: "test-secret", noLimits: true });
  events = app;
  api = request(app);
});
afterAll(() => db.close());

async function user(email: string) {
  const r = await api.post("/api/auth/register").send({ email, password: "password123" });
  expect(r.status).toBe(201);
  return { id: r.body.userId as string, h: { Authorization: `Bearer ${r.body.accessToken}` }, r: r.body };
}

const task = (title: string, extra = {}) => ({ title, ...extra });
const now = () => Date.now();

describe("auth", () => {
  it("registers, rejects duplicates and weak input, logs in", async () => {
    await user("a@example.com");
    expect((await api.post("/api/auth/register").send({ email: "A@example.com", password: "password123" })).status).toBe(409);
    expect((await api.post("/api/auth/register").send({ email: "x@example.com", password: "short" })).status).toBe(400);
    expect((await api.post("/api/auth/login").send({ email: "a@example.com", password: "nope-nope-1" })).status).toBe(401);
    expect((await api.post("/api/auth/login").send({ email: "a@example.com", password: "password123" })).status).toBe(200);
  });

  it("rotates refresh tokens and rejects reuse", async () => {
    const u = await user("r@example.com");
    const r1 = await api.post("/api/auth/refresh").send({ refreshToken: u.r.refreshToken });
    expect(r1.status).toBe(200);
    expect((await api.post("/api/auth/refresh").send({ refreshToken: u.r.refreshToken })).status).toBe(401);
    expect((await api.post("/api/auth/refresh").send({ refreshToken: r1.body.refreshToken })).status).toBe(200);
  });

  it("requires auth", async () => {
    expect((await api.post("/api/sync").send({ cursor: 0, changes: [] })).status).toBe(401);
    expect((await api.get("/api/items").set("Authorization", "Bearer garbage")).status).toBe(401);
  });
});

describe("sync", () => {
  it("pushes, pulls with cursor, fills defaults", async () => {
    const u = await user("s1@example.com");
    const t0 = now();
    const r = await api
      .post("/api/sync")
      .set(u.h)
      .send({ cursor: 0, changes: [{ type: "task", id: "t1", data: task("Milch"), updatedAt: t0, deleted: false }] });
    expect(r.status).toBe(200);
    expect(r.body.rejected).toEqual([]);
    expect(r.body.changes).toHaveLength(1);
    expect(r.body.changes[0].data).toMatchObject({ title: "Milch", priority: 0, subtasks: [], done: false });
    const cursor = r.body.cursor;
    const again = await api.post("/api/sync").set(u.h).send({ cursor, changes: [] });
    expect(again.body.changes).toHaveLength(0);
    expect(again.body.cursor).toBe(cursor);
  });

  it("last write wins by updatedAt; stale writes are rejected", async () => {
    const u = await user("s2@example.com");
    const t = now();
    const push = (title: string, updatedAt: number) =>
      api
        .post("/api/sync")
        .set(u.h)
        .send({ cursor: 0, changes: [{ type: "task", id: "x", data: task(title), updatedAt, deleted: false }] });
    await push("new", t + 1000);
    const stale = await push("old", t);
    expect(stale.body.rejected).toEqual([{ type: "task", id: "x", reason: "stale" }]);
    expect(stale.body.changes[0].data.title).toBe("new");
    expect((await push("same-time-retry", t + 1000)).body.rejected).toEqual([]);
  });

  it("tombstones propagate and resurrect with a newer write", async () => {
    const u = await user("s3@example.com");
    const t = now();
    const send = (c: object[]) => api.post("/api/sync").set(u.h).send({ cursor: 0, changes: c });
    await send([{ type: "task", id: "d", data: task("a"), updatedAt: t, deleted: false }]);
    const del = await send([{ type: "task", id: "d", data: {}, updatedAt: t + 1, deleted: true }]);
    expect(del.body.changes.find((c: any) => c.id === "d").deleted).toBe(true);
    expect((await api.get("/api/items?type=task").set(u.h)).body).toHaveLength(0);
    const back = await send([{ type: "task", id: "d", data: task("b"), updatedAt: t + 2, deleted: false }]);
    expect(back.body.changes.find((c: any) => c.id === "d").deleted).toBe(false);
  });

  it("rejects invalid payloads per item without blocking the rest", async () => {
    const u = await user("s4@example.com");
    const t = now();
    const r = await api
      .post("/api/sync")
      .set(u.h)
      .send({
        cursor: 0,
        changes: [
          { type: "task", id: "bad", data: { title: "" }, updatedAt: t, deleted: false },
          { type: "task", id: "bad2", data: task("x", { dueDate: "tomorrow" }), updatedAt: t, deleted: false },
          { type: "task", id: "ok", data: task("fine", { priority: 3 }), updatedAt: t, deleted: false },
        ],
      });
    expect(r.body.rejected.map((x: any) => x.id).sort()).toEqual(["bad", "bad2"]);
    expect(r.body.changes.map((x: any) => x.id)).toEqual(["ok"]);
    expect((await api.post("/api/sync").set(u.h).send({ cursor: 0, changes: [{ type: "nope", id: "1", data: {}, updatedAt: t, deleted: false }] })).status).toBe(400);
  });

  it("isolates users", async () => {
    const a = await user("iso-a@example.com");
    const b = await user("iso-b@example.com");
    await api.post("/api/sync").set(a.h).send({ cursor: 0, changes: [{ type: "task", id: "secret", data: task("mine"), updatedAt: now(), deleted: false }] });
    expect((await api.post("/api/sync").set(b.h).send({ cursor: 0, changes: [] })).body.changes).toHaveLength(0);
    expect((await api.get("/api/items/task/secret").set(b.h)).status).toBe(404);
  });

  it("pages large pulls with hasMore", async () => {
    const u = await user("page@example.com");
    const t = now();
    const changes = Array.from({ length: 500 }, (_, i) => ({ type: "tag", id: `g${i}`, data: { name: `n${i}` }, updatedAt: t, deleted: false }));
    await api.post("/api/sync").set(u.h).send({ cursor: 0, changes });
    await api.post("/api/sync").set(u.h).send({ cursor: 0, changes: [{ type: "tag", id: "extra", data: { name: "e" }, updatedAt: t, deleted: false }] });
    const p1 = await api.post("/api/sync").set(u.h).send({ cursor: 0, changes: [] });
    expect(p1.body.changes).toHaveLength(500);
    expect(p1.body.hasMore).toBe(true);
    const p2 = await api.post("/api/sync").set(u.h).send({ cursor: p1.body.cursor, changes: [] });
    expect(p2.body.changes).toHaveLength(1);
    expect(p2.body.hasMore).toBe(false);
  });

  it("concurrent writers never lose or skip rows", async () => {
    const u = await user("conc@example.com");
    const t = now();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        api.post("/api/sync").set(u.h).send({ cursor: 0, changes: [{ type: "tag", id: `c${i}`, data: { name: `n${i}` }, updatedAt: t, deleted: false }] }),
      ),
    );
    const all = await api.post("/api/sync").set(u.h).send({ cursor: 0, changes: [] });
    expect(new Set(all.body.changes.map((c: any) => c.id)).size).toBe(20);
    const seqs = all.body.changes.map((c: any) => c.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });
});

describe("api tokens and REST items (MCP path)", () => {
  it("creates a token, uses it, cannot mint tokens with it, revokes it", async () => {
    const u = await user("tok@example.com");
    const c = await api.post("/api/tokens").set(u.h).send({ name: "claude" });
    expect(c.status).toBe(201);
    expect(c.body.token).toMatch(/^dl_/);
    const pat = { Authorization: `Bearer ${c.body.token}` };
    expect((await api.get("/api/me").set(pat)).body.email).toBe("tok@example.com");
    expect((await api.post("/api/tokens").set(pat).send({ name: "evil" })).status).toBe(403);
    const list = await api.get("/api/tokens").set(u.h);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(c.body.token);
    expect((await api.delete(`/api/tokens/${c.body.id}`).set(u.h)).status).toBe(200);
    expect((await api.get("/api/me").set(pat)).status).toBe(401);
  });

  it("REST changes show up in sync and vice versa", async () => {
    const u = await user("rest@example.com");
    const created = await api.post("/api/items/task").set(u.h).send({ data: task("per MCP", { priority: 2 }) });
    expect(created.status).toBe(201);
    const id = created.body.id;
    const first = await api.post("/api/sync").set(u.h).send({ cursor: 0, changes: [] });
    expect(first.body.changes.map((c: any) => c.id)).toContain(id);
    const patched = await api.patch(`/api/items/task/${id}`).set(u.h).send({ data: { done: true } });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ title: "per MCP", priority: 2, done: true });
    const next = await api.post("/api/sync").set(u.h).send({ cursor: first.body.cursor, changes: [] });
    expect(next.body.changes).toHaveLength(1);
    expect(next.body.changes[0].data.done).toBe(true);
    expect((await api.post("/api/items/task").set(u.h).send({ data: { title: "" } })).status).toBe(400);
    expect((await api.get("/api/items/bogus/1").set(u.h)).status).toBe(404);
    expect((await api.delete(`/api/items/task/${id}`).set(u.h)).status).toBe(200);
    expect((await api.get(`/api/items/task/${id}`).set(u.h)).status).toBe(404);
  });

  it("streams a change event to SSE listeners", async () => {
    const u = await user("sse@example.com");
    const server = (await import("node:http")).createServer(events as any);
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as any).port;
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: u.h, signal: ac.signal });
    const reader = res.body!.getReader();
    await reader.read(); // retry line
    await api.post("/api/items/task").set(u.h).send({ data: task("ping") });
    const chunk = new TextDecoder().decode((await reader.read()).value);
    expect(chunk).toMatch(/^data: \d+/);
    ac.abort();
    server.closeAllConnections();
    server.close();
  });
});
