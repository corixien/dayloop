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

it("keeps both fields when two patches of one task run at the same time", async () => {
  const local = new Local("dl-concurrent");
  await local.put("task", "t", { title: "alt", notes: "alt" });
  await Promise.all([local.patch("task", "t", { title: "neu" }), local.patch("task", "t", { notes: "neue Notiz" }), local.patch("task", "t", { priority: 2 })]);
  expect(await local.get("task", "t")).toMatchObject({ title: "neu", notes: "neue Notiz", priority: 2 });
});
