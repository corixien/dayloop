// Local development server on in-process Postgres (PGlite), data in ../.pglite. No Neon needed.
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createApp } from "./app.js";
import { type Db, migrate } from "./db.js";

const pg = new PGlite(resolve(process.env.PGLITE_DIR ?? "../.pglite"));
const wrap = (q: { query: PGlite["query"] }) => ({
  query: async (sql: string, params?: unknown[]) => ({ rows: (await q.query(sql, params as any[])).rows as any[] }),
});
const db: Db = { ...wrap(pg), tx: (fn) => pg.transaction((t) => fn(wrap(t as any))), close: () => pg.close() };
await migrate(db);
const port = Number(process.env.PORT ?? 3000);
createApp({ db, jwtSecret: "dev-secret", noLimits: true, webDir: resolve("../web/dist") }).listen(port, () => console.log(`dayloop dev server on :${port}`));
