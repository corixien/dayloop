import Dexie, { type Table } from "dexie";
import { type Change, type DataOf, type ItemType, type ServerChange, itemSchemas, parseData } from "@dayloop/shared";

export interface Row {
  /** `${type}:${id}` */
  key: string;
  type: ItemType;
  id: string;
  data: any;
  updatedAt: number;
  deleted: 0 | 1;
  /** 1 = local change not yet acknowledged by the server */
  dirty: 0 | 1;
}

interface Meta {
  key: string;
  value: unknown;
}

export type Item<T extends ItemType> = DataOf[T] & { id: string; updatedAt: number };

class DayloopDexie extends Dexie {
  items!: Table<Row, string>;
  meta!: Table<Meta, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({ items: "key, type, dirty, [type+deleted]", meta: "key" });
  }
}

/** Local offline store. Every write is stamped and marked dirty; the sync client pushes dirty rows. */
export class Local {
  readonly db: DayloopDexie;
  /** called after any local write so sync can run */
  onWrite: () => void = () => {};

  constructor(name = "dayloop") {
    this.db = new DayloopDexie(name);
  }

  async put<T extends ItemType>(type: T, id: string, data: unknown): Promise<DataOf[T]> {
    const parsed = parseData(type, data);
    const key = `${type}:${id}`;
    await this.db.transaction("rw", this.db.items, async () => {
      const prev = await this.db.items.get(key);
      const updatedAt = Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
      await this.db.items.put({ key, type, id, data: parsed, updatedAt, deleted: 0, dirty: 1 });
    });
    this.onWrite();
    return parsed;
  }

  /** Merge a patch into the existing record (or create from defaults + patch). */
  async patch<T extends ItemType>(type: T, id: string, patch: Partial<DataOf[T]>): Promise<DataOf[T]> {
    const prev = await this.db.items.get(`${type}:${id}`);
    return this.put(type, id, { ...(prev && !prev.deleted ? prev.data : {}), ...patch });
  }

  async remove(type: ItemType, id: string): Promise<void> {
    const key = `${type}:${id}`;
    await this.db.transaction("rw", this.db.items, async () => {
      const prev = await this.db.items.get(key);
      const updatedAt = Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
      await this.db.items.put({ key, type, id, data: {}, updatedAt, deleted: 1, dirty: 1 });
    });
    this.onWrite();
  }

  async removeMany(type: ItemType, ids: string[]): Promise<void> {
    for (const id of ids) await this.remove(type, id);
  }

  /** Rows written by an older app version miss newer fields: fill defaults on read. */
  private toItem<T extends ItemType>(type: T, r: Row): Item<T> {
    const parsed = itemSchemas[type].safeParse(r.data);
    return { ...(parsed.success ? parsed.data : r.data), id: r.id, updatedAt: r.updatedAt } as Item<T>;
  }

  async all<T extends ItemType>(type: T): Promise<Item<T>[]> {
    const rows = await this.db.items.where("[type+deleted]").equals([type, 0]).toArray();
    return rows.map((r) => this.toItem(type, r));
  }

  async get<T extends ItemType>(type: T, id: string): Promise<Item<T> | undefined> {
    const r = await this.db.items.get(`${type}:${id}`);
    return r && !r.deleted ? this.toItem(type, r) : undefined;
  }

  // ---- sync support ----

  async dirtyBatch(limit = 500): Promise<Row[]> {
    return this.db.items.where("dirty").equals(1).limit(limit).toArray();
  }

  toChange(r: Row): Change {
    return { type: r.type, id: r.id, data: r.data, updatedAt: r.updatedAt, deleted: !!r.deleted };
  }

  /** Clear dirty on pushed rows unless they were edited again while the request was in flight. */
  async markPushed(pushed: Row[]): Promise<void> {
    await this.db.transaction("rw", this.db.items, async () => {
      for (const p of pushed) {
        const cur = await this.db.items.get(p.key);
        if (cur && cur.updatedAt === p.updatedAt) await this.db.items.update(p.key, { dirty: 0 });
      }
    });
  }

  /** Server wins unless a newer local edit is still waiting to be pushed. */
  async applyPulled(changes: ServerChange[]): Promise<void> {
    await this.db.transaction("rw", this.db.items, async () => {
      for (const c of changes) {
        const key = `${c.type}:${c.id}`;
        const cur = await this.db.items.get(key);
        if (cur?.dirty && cur.updatedAt > c.updatedAt) continue;
        await this.db.items.put({
          key, type: c.type, id: c.id, data: c.deleted ? {} : c.data,
          updatedAt: c.updatedAt, deleted: c.deleted ? 1 : 0, dirty: 0,
        });
      }
    });
  }

  async markAllDirty(): Promise<void> {
    await this.db.items.toCollection().modify({ dirty: 1 });
  }

  async metaGet<T>(key: string): Promise<T | undefined> {
    return (await this.db.meta.get(key))?.value as T | undefined;
  }
  async metaSet(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  async clear(): Promise<void> {
    await this.db.transaction("rw", this.db.items, this.db.meta, async () => {
      await this.db.items.clear();
      await this.db.meta.clear();
    });
  }
}
