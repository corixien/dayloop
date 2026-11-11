import { describe, expect, it } from "vitest";
import { checkRange, defaultEnd, fromMin, nextStart, toMin } from "./planLogic";

const b = (start: string, end: string) => ({ start, end });

describe("plan logic", () => {
  it("converts times", () => {
    expect(toMin("13:30")).toBe(810);
    expect(fromMin(810)).toBe("13:30");
    expect(fromMin(5000)).toBe("23:59");
  });
  it("starts a new block after the last one, but not in the past", () => {
    expect(nextStart([b("11:00", "12:00")], 10 * 60 + 12)).toBe("12:00");
    expect(nextStart([b("11:00", "12:00")], 13 * 60 + 7)).toBe("13:05");
    expect(nextStart([], 9 * 60 + 41)).toBe("09:40");
    expect(nextStart([b("09:00", "10:30"), b("08:00", "08:30")], null)).toBe("10:30");
    expect(nextStart([], null)).toBe("08:00");
  });
  it("default end is one hour later, clamped", () => {
    expect(defaultEnd("12:00")).toBe("13:00");
    expect(defaultEnd("23:30")).toBe("23:59");
    expect(defaultEnd("12:00", 30)).toBe("12:30");
  });
  it("validates ranges", () => {
    expect(checkRange("09:00", "10:00")).toBeNull();
    expect(checkRange("10:00", "10:00")).toBe("order");
    expect(checkRange("9:00", "10:00")).toBe("format");
  });
});

import { blockProgress, carryOver, resolveEntries, type Block, type TaskRef } from "./planLogic";
import { ensurePointId, formatNotes, parseNotes, uncheckAll } from "./notes";

describe("plan entries", () => {
  const task = (id: string, notes: string, over: Partial<TaskRef> = {}): TaskRef => ({ id, title: `T${id}`, notes, done: false, priority: 0, order: 0, trashedAt: null, ...over });
  const tasks = new Map([
    ["1", task("1", "- [ #aa11] a\n- [x@5#bb22] b\n- [ ] c")],
    ["2", task("2", "")],
    ["3", task("3", "", { trashedAt: 1 })],
  ]);

  it("round-trips point ids and keeps them when unchecking", () => {
    const n = "- [ #aa11] a\n- [x@5#bb22] b\n- [x] c";
    expect(formatNotes(parseNotes(n))).toBe(n);
    expect(parseNotes(n)[1]).toMatchObject({ id: "bb22", done: true, at: 5 });
    expect(uncheckAll(n)).toBe("- [ #aa11] a\n- [ #bb22] b\n- [ ] c");
  });

  it("ensurePointId adds an id once", () => {
    const r = ensurePointId("x\n- [ ] a", 1);
    expect(parseNotes(r.notes)[1].id).toBe(r.id);
    expect(ensurePointId(r.notes, 1)).toEqual(r);
  });

  it("resolves entries live: subset by id, trashed and missing dropped", () => {
    const v = resolveEntries([{ taskId: "1", points: ["bb22"] }, { taskId: "3", points: null }, { taskId: "9", points: null }, { taskId: "2", points: null }], tasks);
    expect(v.map((x) => x.task.id)).toEqual(["1", "2"]);
    expect(v[0].points.map((p) => p.text)).toEqual(["b"]);
    expect(resolveEntries([{ taskId: "1", points: null }], tasks)[0].points).toHaveLength(3);
    expect(blockProgress("- [x] own", resolveEntries([{ taskId: "1", points: null }, { taskId: "2", points: null }], tasks))).toEqual({ done: 2, total: 5 });
  });

  it("carries only open work to the next day, once", () => {
    const blk = (id: string, title: string, date: string, entries: Block["entries"]): Block => ({ id, title, notes: "", date, start: "15:00", end: "17:00", entries });
    const from = [blk("a", "Schule", "d1", [{ taskId: "1", points: ["aa11", "bb22"] }, { taskId: "2", points: null }]), blk("b", "Leer", "d1", [])];
    const done = new Map(tasks).set("2", task("2", "", { done: true }));
    const plan = carryOver(from, [], "d2", done);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]).toMatchObject({ title: "Schule", date: "d2", entries: [{ taskId: "1", points: ["aa11"] }] });
    const there = [blk("z", "schule", "d2", [{ taskId: "1", points: ["aa11"] }])];
    expect(carryOver(from, there, "d2", done)).toEqual({ create: [], update: [] });
  });
  it("lists the todos of a block by priority, highest first (stable)", () => {
    const m = new Map([["1", task("1", "", { priority: 1 })], ["2", task("2", "", { priority: 3 })], ["3", task("3", "", { priority: 1 })], ["4", task("4", "")]]);
    const ids = resolveEntries(["1", "2", "3", "4"].map((taskId) => ({ taskId, points: null })), m).map((v) => v.task.id);
    expect(ids).toEqual(["2", "1", "3", "4"]);
  });
});
