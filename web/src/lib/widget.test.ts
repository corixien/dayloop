import { describe, expect, it } from "vitest";
import { parseData } from "@dayloop/shared";
import type { TaskItem } from "./taskLogic";
import { buildSnapshot } from "./widgetSnapshot";

const NOW = new Date(2026, 9, 31, 12, 0);
const task = (id: string, extra: object): TaskItem => ({ id, updatedAt: 1, ...parseData("task", { title: id, ...extra }) });

describe("widget snapshot", () => {
  it("groups todos by deadline and Have Done by day", () => {
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

    expect(s.todo.filter((r) => r.k === "h").map((r) => r.title)).toEqual(["Überfällig", "Heute", "Morgen", "Später", "Ohne Deadline"]);
    expect(s.todo.find((r) => r.id === "now")).toMatchObject({ meta: "15:00" });
    expect(s.todo.find((r) => r.id === "over")).toMatchObject({ prio: 3 });
    expect(s.todo.find((r) => r.id === "rep")).toMatchObject({ rep: true });
    expect(s.todo.some((r) => r.id === "gone" || r.id === "d1")).toBe(false);

    expect(s.done.map((r) => (r.k === "h" ? `# ${r.title}` : `${r.id} ${r.meta}`))).toEqual(["# Heute", "d1 09:05", "# Gestern", "d2 20:15"]);
    expect(s.labels).toMatchObject({ today: "Heute", todo: "Todo", done: "Have Done" });
  });
});
