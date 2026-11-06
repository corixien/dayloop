import { describe, expect, it } from "vitest";
import { parseData } from "@dayloop/shared";
import type { TaskItem } from "./taskLogic";
import { buildSnapshot } from "./widgetSnapshot";

const NOW = new Date(2026, 9, 31, 12, 0);
const task = (id: string, extra: object): TaskItem => ({ id, updatedAt: 1, ...parseData("task", { title: id, ...extra }) });

describe("widget snapshot", () => {
  it("lists todos in one list (due within 24 h first) and Have Done by day", () => {
    const yesterday = new Date(2026, 9, 30, 20, 15).getTime();
    const today = new Date(2026, 9, 31, 9, 5).getTime();
    const s = buildSnapshot([
      task("later", { dueDate: "2026-11-05" }),
      task("over", { dueDate: "2026-10-29", priority: 3 }),
      task("now", { dueDate: "2026-10-31", dueTime: "15:00" }),
      task("none", {}),
      task("rep", { dueDate: "2026-11-01", repeat: { freq: "daily", interval: 1 } }),
      task("d1", { done: true, completedAt: today }),
      task("d2", { done: true, completedAt: yesterday }),
      task("gone", { trashedAt: 5 }),
    ], "de", NOW);

    expect(s.todo.map((r) => r.id)).toEqual(["over", "now", "rep", "later", "none"]);
    expect(s.todo.find((r) => r.id === "now")).toMatchObject({ meta: "15:00" });
    expect(s.todo.find((r) => r.id === "over")).toMatchObject({ prio: 3 });
    expect(s.todo.find((r) => r.id === "rep")).toMatchObject({ rep: true });
    expect(s.todo.some((r) => r.id === "gone" || r.id === "d1")).toBe(false);

    expect(s.done.map((r) => (r.k === "h" ? `# ${r.title}` : `${r.id} ${r.meta}`))).toEqual(["# Heute", "d1 09:05", "# Gestern", "d2 20:15"]);
    expect(s.labels).toMatchObject({ today: "Heute", todo: "Todo", done: "Have Done" });
  });
});

describe("widget calendar tab", () => {
  it("lists upcoming appointments by day, nearest first, within two years", async () => {
    const { buildSnapshot } = await import("./widgetSnapshot");
    const mk = (id: string, title: string, dueDate: string, dueTime: string | null, over: object = {}) => ({ id, title, notes: "", subtasks: [], done: false, trashedAt: null, priority: 0, order: 0, updatedAt: 0, dueDate, dueTime, showBeforeMin: 1440, repeat: null, ...over }) as never;
    const now = new Date(2026, 10, 5, 10, 0);
    const snap = buildSnapshot([
      mk("far", "Konzert", "2026-12-24", "20:00"),
      mk("near", "Zahnarzt", "2026-11-06", "15:00"),
      mk("tooFar", "Fern", "2029-01-01", null),
      mk("past", "Vorbei", "2026-11-01", null),
      mk("plain", "Aufgabe", "2026-11-07", null, { showBeforeMin: null }),
    ], "de", now);
    expect(snap.events.map((r) => r.title)).toEqual(["Morgen", "Zahnarzt", expect.stringContaining("Dez"), "Konzert"]);
    expect(snap.events[1].meta).toBe("15:00");
  });
});
