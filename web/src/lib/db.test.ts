import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { Local } from "./db";

it("fills defaults for rows saved by an older app version", async () => {
  const local = new Local("dl-old-rows");
  await local.db.items.bulkPut([
    { key: "settings:settings", type: "settings", id: "settings", data: { language: "de", theme: "dark" }, updatedAt: 1, deleted: 0, dirty: 0 },
    { key: "task:a", type: "task", id: "a", data: { title: "alt" }, updatedAt: 1, deleted: 0, dirty: 0 },
  ]);
  expect((await local.all("settings"))[0].hiddenSmart).toEqual([]);
  const t = await local.get("task", "a");
  expect(t).toMatchObject({ title: "alt", trashedAt: null, subtasks: [] });
});
