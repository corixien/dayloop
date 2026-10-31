import { describe, expect, it } from "vitest";
import { addMonths, monthGrid, startOfWeek } from "./dates";
import { parseQuickAdd } from "./nlp";
import { nextDue, occurrences } from "./repeat";

// Wednesday
const NOW = new Date(2026, 9, 28, 10, 0);

describe("quick add", () => {
  it("parses german", () => {
    const p = parseQuickAdd("Zahnarzt morgen 15 Uhr !1", NOW);
    expect(p).toMatchObject({
      title: "Zahnarzt", dueDate: "2026-10-29", dueTime: "15:00", priority: 3,
    });
  });
  it("parses english, weekdays and repeats", () => {
    expect(parseQuickAdd("call mom friday 3pm", NOW)).toMatchObject({ title: "call mom", dueDate: "2026-10-30", dueTime: "15:00" });
    const r = parseQuickAdd("Sport jeden montag", NOW);
    expect(r.repeat).toEqual({ freq: "weekly", interval: 1, byWeekday: [1] });
    expect(r.dueDate).toBe("2026-11-02");
    expect(r.title).toBe("Sport");
  });
  it("splits a note after //", () => {
    const p = parseQuickAdd("Zahnarzt morgen // Versicherungskarte mitnehmen", NOW);
    expect(p).toMatchObject({ title: "Zahnarzt", dueDate: "2026-10-29", notes: "Versicherungskarte mitnehmen" });
  });
  it("parses numeric dates and relative days", () => {
    expect(parseQuickAdd("Steuer 15.11.", NOW).dueDate).toBe("2026-11-15");
    expect(parseQuickAdd("Steuer 3.1.", NOW).dueDate).toBe("2027-01-03");
    expect(parseQuickAdd("x in 3 Tagen", NOW).dueDate).toBe("2026-10-31");
    expect(parseQuickAdd("nur Titel", NOW)).toMatchObject({ title: "nur Titel", dueDate: null, priority: 0 });
  });
});

describe("repeat", () => {
  it("daily/weekly/monthly steps from the due date", () => {
    expect(nextDue("2026-10-28", { freq: "daily", interval: 1 }, "2026-10-28")).toBe("2026-10-29");
    expect(nextDue("2026-10-28", { freq: "weekly", interval: 2 }, "2026-10-28")).toBe("2026-11-11");
    expect(nextDue("2026-01-31", { freq: "monthly", interval: 1 }, "2026-01-31")).toBe("2026-02-28");
  });
  it("weekly with weekdays", () => {
    const r = { freq: "weekly" as const, interval: 1, byWeekday: [1, 3, 5] };
    expect(nextDue("2026-10-28", r, "2026-10-28")).toBe("2026-10-30");
    expect(nextDue("2026-10-30", r, "2026-10-30")).toBe("2026-11-02");
  });
  it("skips past occurrences, honors fromCompletion and until", () => {
    expect(nextDue("2026-10-20", { freq: "daily", interval: 1 }, "2026-10-28")).toBe("2026-10-28");
    expect(nextDue("2026-10-01", { freq: "weekly", interval: 1, fromCompletion: true }, "2026-10-28")).toBe("2026-11-04");
    expect(nextDue("2026-10-28", { freq: "daily", interval: 1, until: "2026-10-28" }, "2026-10-28")).toBeNull();
  });
  it("lists occurrences in a range", () => {
    expect(occurrences("2026-10-26", { freq: "weekly", interval: 1 }, "2026-11-01", "2026-11-30")).toEqual([
      "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30",
    ]);
  });
});

describe("dates", () => {
  it("month math and grid", () => {
    expect(addMonths("2026-12-31", 2)).toBe("2027-02-28");
    expect(startOfWeek("2026-10-28", 1)).toBe("2026-10-26");
    const g = monthGrid("2026-10-15", 1);
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-09-28");
  });
});
