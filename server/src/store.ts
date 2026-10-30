import {
  type Change,
  type ItemType,
  type ServerChange,
  type SyncResponse,
  itemSchemas,
} from "@dayloop/shared";
import type { Db, Queryable } from "./db.js";

const PAGE = 500;
const MAX_ITEMS_PER_USER = 100_000;
const MAX_DATA_BYTES = 100_000;

type Rejected = SyncResponse["rejected"];

interface Row {
  type: ItemType;
  id: string;
  data: unknown;
  updated_at: string;
  deleted: boolean;
  seq: string;
}

const toChange = (r: Row): ServerChange => ({
  type: r.type,
  id: r.id,
  data: r.data,
  updatedAt: Number(r.updated_at),
  deleted: r.deleted,
  seq: Number(r.seq),
});

/** Validate and normalize (defaults filled) a payload. Returns null when invalid. */
export function normalize(type: ItemType, data: unknown): unknown | null {
  const r = itemSchemas[type].safeParse(data);
  if (!r.success) return null;
  if (JSON.stringify(r.data).length > MAX_DATA_BYTES) return null;
  return r.data;
}

export type Notify = (userId: string, seq: number) => void;

export class Store {
  constructor(private db: Db, private notify: Notify = () => {}) {}

  /**
   * Apply changes with last-write-wins on `updatedAt`. All writers take one advisory lock so
   * `seq` order equals commit order and a pulling client's cursor never skips rows.
   */
  async apply(userId: string, changes: Change[]): Promise<{ rejected: Rejected; maxSeq: number }> {
    const rejected: Rejected = [];
    let maxSeq = 0;
    if (changes.length === 0) return { rejected, maxSeq };
    await this.db.tx(async (q) => {
      await q.query("select pg_advisory_xact_lock(7001)");
      for (const c of changes) {
        const data = c.deleted ? {} : normalize(c.type, c.data);
        if (data === null) {
          rejected.push({ type: c.type, id: c.id, reason: "invalid" });
          continue;
        }
        const cur = await q.query<{ updated_at: string }>(
          "select updated_at from items where user_id=$1 and type=$2 and id=$3",
          [userId, c.type, c.id],
        );
        if (cur.rows[0] && Number(cur.rows[0].updated_at) > c.updatedAt) {
          rejected.push({ type: c.type, id: c.id, reason: "stale" });
          continue;
        }
        if (!cur.rows[0]) {
          const n = await q.query<{ n: string }>("select count(*) n from items where user_id=$1", [userId]);
          if (Number(n.rows[0].n) >= MAX_ITEMS_PER_USER) {
            rejected.push({ type: c.type, id: c.id, reason: "quota" });
            continue;
          }
        }
        const r = await q.query<{ seq: string }>(
          `insert into items (user_id, type, id, data, updated_at, deleted, seq)
           values ($1,$2,$3,$4,$5,$6,nextval('change_seq'))
           on conflict (user_id, type, id) do update
             set data=excluded.data, updated_at=excluded.updated_at, deleted=excluded.deleted, seq=excluded.seq
           returning seq`,
          [userId, c.type, c.id, JSON.stringify(data), c.updatedAt, c.deleted],
        );
        maxSeq = Math.max(maxSeq, Number(r.rows[0].seq));
      }
    });
    if (maxSeq > 0) this.notify(userId, maxSeq);
    return { rejected, maxSeq };
  }

  async pull(userId: string, cursor: number, q: Queryable = this.db): Promise<Omit<SyncResponse, "rejected">> {
    const r = await q.query<Row>(
      "select type,id,data,updated_at,deleted,seq from items where user_id=$1 and seq>$2 order by seq limit $3",
      [userId, cursor, PAGE + 1],
    );
    const hasMore = r.rows.length > PAGE;
    const rows = hasMore ? r.rows.slice(0, PAGE) : r.rows;
    const changes = rows.map(toChange);
    return { changes, cursor: changes.length ? changes[changes.length - 1].seq : cursor, hasMore };
  }

  async sync(userId: string, cursor: number, changes: Change[]): Promise<SyncResponse> {
    const { rejected } = await this.apply(userId, changes);
    return { ...(await this.pull(userId, cursor)), rejected };
  }

  async list(userId: string, type?: ItemType): Promise<ServerChange[]> {
    const r = await this.db.query<Row>(
      `select type,id,data,updated_at,deleted,seq from items
       where user_id=$1 and deleted=false and ($2::text is null or type=$2) order by updated_at desc limit 5000`,
      [userId, type ?? null],
    );
    return r.rows.map(toChange);
  }

  async get(userId: string, type: ItemType, id: string): Promise<ServerChange | null> {
    const r = await this.db.query<Row>(
      "select type,id,data,updated_at,deleted,seq from items where user_id=$1 and type=$2 and id=$3 and deleted=false",
      [userId, type, id],
    );
    return r.rows[0] ? toChange(r.rows[0]) : null;
  }

  /** Create/merge-update/replace one item from the REST API (server clock). Returns null when invalid. */
  async put(
    userId: string,
    type: ItemType,
    id: string,
    data: Record<string, unknown>,
    mode: "merge" | "replace",
  ): Promise<ServerChange | null> {
    let next = data;
    if (mode === "merge") {
      const cur = await this.get(userId, type, id);
      if (cur) next = { ...(cur.data as object), ...data };
    }
    const updatedAt = Date.now();
    const { rejected } = await this.apply(userId, [{ type, id, data: next, updatedAt, deleted: false }]);
    if (rejected.length) return null;
    return this.get(userId, type, id);
  }

  async remove(userId: string, type: ItemType, id: string): Promise<boolean> {
    if (!(await this.get(userId, type, id))) return false;
    const { rejected } = await this.apply(userId, [{ type, id, data: {}, updatedAt: Date.now(), deleted: true }]);
    return rejected.length === 0;
  }
}
