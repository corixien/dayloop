import { describe, expect, it } from "vitest";
import { parseData } from "@dayloop/shared";
import { dueMs } from "./dates";
import { upcomingReminders } from "./reminders";

const task = (id: string, extra: object) => ({ id, ...parseData("task", { title: id, ...extra }) });
const NOW = new Date(2026, 9, 30, 10, 0).getTime();
const opts = { now: NOW, horizonMs: 48 * 3600_000, allDayHour: 9, todayStr: "2026-10-30" };

describe("reminders", () => {
  it("offsets from due time, all-day uses default hour, skips past and done", () => {
    const r = upcomingReminders([
      task("a", { dueDate: "2026-10-30", dueTime: "15:00", reminders: [{ offsetMin: 30 }, { offsetMin: 0 }] }),
      task("b", { dueDate: "2026-10-31", reminders: [{ offsetMin: 0 }] }),
      task("c", { dueDate: "2026-10-30", dueTime: "09:00", reminders: [{ offsetMin: 0 }] }),
      task("d", { dueDate: "2026-10-30", dueTime: "15:00", reminders: [{ offsetMin: 0 }], done: true }),
    ], [], new Map(), opts);
    expect(r.map((x) => [x.title, x.at])).toEqual([
      ["a", dueMs("2026-10-30", "14:30")], ["a", dueMs("2026-10-30", "15:00")], ["b", dueMs("2026-10-31", null, 9)],
    ]);
  });
  it("expands repeating tasks and habit reminders (skipping completed days)", () => {
    const rep = task("r", { dueDate: "2026-10-30", dueTime: "08:00", repeat: { freq: "daily", interval: 1 }, reminders: [{ offsetMin: 0 }] });
    const r = upcomingReminders([rep], [], new Map(), opts);
    expect(r.map((x) => x.key)).toEqual(["task:r:2026-10-31:0", "task:r:2026-11-01:0"]);
    const habit = { id: "h", ...parseData("habit", { name: "Lesen", startDate: "2026-10-01", reminderTime: "20:00" }) };
    const done = new Map([["h", new Map([["2026-10-30", 1]])]]);
    expect(upcomingReminders([], [habit], done, opts).map((x) => x.key)).toEqual(["habit:h:2026-10-31"]);
    expect(upcomingReminders([], [habit], new Map(), opts)).toHaveLength(2);
  });
});
