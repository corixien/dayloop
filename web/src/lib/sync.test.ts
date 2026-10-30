import "fake-indexeddb/auto";
import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:http";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../server/src/app";
import { type Db, migrate } from "../../../server/src/db";
import { Local } from "./db";
import { type KV, SyncClient } from "./sync";

function pgliteDb(): Db {
  const pg = new PGlite();
  const wrap = (q: { query: PGlite["query"] }) => ({
    query: async (sql: string, params?: unknown[]) => ({ rows: (await q.query(sql, params as any[])).rows as any[] }),
  });
  return { ...wrap(pg), tx: (fn) => pg.transaction((t) => fn(wrap(t as any))), close: () => pg.close() };
}

const memKv = (): KV => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};

let db: Db;
let server: Server;
let url: string;
let n = 0;

beforeAll(async () => {
  db = pgliteDb();
  await migrate(db);
  server = createServer(createApp({ db, jwtSecret: "s", noLimits: true }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await db.close();
});

function device(fetchImpl?: typeof fetch) {
  const local = new Local(`dl-test-${++n}`);
  const sync = new SyncClient(local, memKv(), url, fetchImpl);
  return { local, sync };
}
const until = async (fn: () => Promise<boolean>, ms = 4000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timeout");
};

describe("two devices", () => {
  it("syncs create, edit, conflict (LWW) and delete both ways", async () => {
    const a = device();
    const b = device();
    await a.sync.register("two@example.com", "password123");
    const list = crypto.randomUUID();
    await a.local.put("list", list, { name: "Arbeit" });
    await a.local.put("task", "t1", { title: "Bericht", listId: list, priority: 2 });
    await a.sync.syncNow();

    await b.sync.login("two@example.com", "password123");
    expect((await b.local.all("task")).map((t) => t.title)).toEqual(["Bericht"]);
    expect((await b.local.all("list"))[0].name).toBe("Arbeit");

    // conflicting edits: B edits later, so B wins everywhere
    await a.local.patch("task", "t1", { title: "A-Titel" });
    await new Promise((r) => setTimeout(r, 5));
    await b.local.patch("task", "t1", { title: "B-Titel", done: true });
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    for (const d of [a, b]) {
      const t = await d.local.get("task", "t1");
      expect(t).toMatchObject({ title: "B-Titel", done: true, priority: 2 });
    }

    await a.local.remove("task", "t1");
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(await b.local.all("task")).toHaveLength(0);
    expect(await b.local.dirtyBatch()).toHaveLength(0);
    a.sync.stop();
    b.sync.stop();
  });

  it("keeps offline edits and pushes them once the network is back", async () => {
    let offline = false;
    const flaky: typeof fetch = (...args) =>
      offline ? Promise.reject(new TypeError("network")) : fetch(...args);
    const a = device(flaky);
    const b = device();
    await a.sync.register("off@example.com", "password123");
    await b.sync.login("off@example.com", "password123");

    offline = true;
    await a.local.put("task", "o1", { title: "offline erstellt" });
    await a.sync.syncNow();
    expect(a.sync.status).toBe("offline");
    expect(await a.local.dirtyBatch()).toHaveLength(1);

    offline = false;
    await a.sync.syncNow();
    expect(a.sync.status).toBe("idle");
    await b.sync.syncNow();
    expect((await b.local.get("task", "o1"))?.title).toBe("offline erstellt");
    a.sync.stop();
    b.sync.stop();
  });

  it("uploads data created before sign-in", async () => {
    const a = device();
    await a.local.put("task", "pre", { title: "vor dem Login" });
    await a.sync.register("pre@example.com", "password123");
    const b = device();
    await b.sync.login("pre@example.com", "password123");
    expect((await b.local.get("task", "pre"))?.title).toBe("vor dem Login");
    a.sync.stop();
    b.sync.stop();
  });

  it("receives changes made through the API token (Claude/MCP) live via SSE", async () => {
    const a = device();
    await a.sync.register("live@example.com", "password123");
    a.sync.start();
    const tok = await a.sync.api<{ token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name: "claude" }) });
    const mcp = (path: string, init: RequestInit = {}) =>
      fetch(url + path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok.token}` } }).then((r) => r.json());

    await new Promise((r) => setTimeout(r, 150)); // let the SSE connection open
    const created: any = await mcp("/api/items/task", { method: "POST", body: JSON.stringify({ data: { title: "von Claude" } }) });
    await until(async () => (await a.local.get("task", created.id))?.title === "von Claude");

    await mcp(`/api/items/task/${created.id}`, { method: "PATCH", body: JSON.stringify({ data: { done: true } }) });
    await until(async () => (await a.local.get("task", created.id))?.done === true);

    // and the other direction: a local edit is visible to the MCP read
    await a.local.patch("task", created.id, { title: "vom Handy" });
    await until(async () => ((await mcp(`/api/items/task/${created.id}`)) as any).data?.title === "vom Handy");
    a.sync.stop();
  });

  it("wipes local data when a different account signs in", async () => {
    const a = device();
    await a.sync.register("u1@example.com", "password123");
    await a.local.put("task", "mine", { title: "u1" });
    await a.sync.syncNow();
    await a.sync.logout(false);
    await a.sync.register("u2@example.com", "password123");
    expect(await a.local.all("task")).toHaveLength(0);
    a.sync.stop();
  });
});
