import pg from "pg";

export interface Queryable {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function pgDb(url: string): Db {
  const local = /localhost|127\.0\.0\.1/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    ssl: local ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  return {
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const r = await fn({ query: (sql, params) => c.query(sql, params as any[]) as any });
        await c.query("commit");
        return r;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
    create table users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      pass_hash text not null,
      created_at timestamptz not null default now()
    );
    create table sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null
    );
    create table api_tokens (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      name text not null,
      prefix text not null,
      token_hash text not null unique,
      created_at timestamptz not null default now(),
      last_used_at timestamptz
    );
    create sequence change_seq;
    create table items (
      user_id uuid not null references users(id) on delete cascade,
      type text not null,
      id text not null,
      data jsonb not null,
      updated_at bigint not null,
      deleted boolean not null default false,
      seq bigint not null,
      primary key (user_id, type, id)
    );
    create index items_seq on items (user_id, seq);
    `,
  },
];

export async function migrate(db: Db): Promise<void> {
  await db.query("create table if not exists _migrations (id int primary key)");
  const done = new Set((await db.query<{ id: number }>("select id from _migrations")).rows.map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await db.tx(async (q) => {
      for (const stmt of m.sql.split(";").map((s) => s.trim()).filter(Boolean)) await q.query(stmt);
      await q.query("insert into _migrations (id) values ($1)", [m.id]);
    });
  }
}
