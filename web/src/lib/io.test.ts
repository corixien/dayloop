import { describe, expect, it } from "vitest";
import { tasksToIcs } from "./ics";
import { parseCsv, parseTickTickCsv } from "./importTick";

const HEAD = '"Folder Name","List Name","Title","Kind","Tags","Content","Is Check list","Start Date","Due Date","Reminder","Repeat","Priority","Status","Created Time","Completed Time","Order","Timezone","Is All Day","Is Floating","Column Name","Column Order","View Mode","taskId","parentId"';

describe("import", () => {
  it("parses quoted csv with newlines", () => {
    expect(parseCsv('a,"b ""x""\nc",d\n1,2,3\n')).toEqual([["a", 'b "x"\nc', "d"], ["1", "2", "3"]]);
  });
  it("maps a TickTick export", () => {
    const csv = [
      '"Date: 2026-10-01"', '"Version: 7.1"', HEAD,
      '"Uni","Mathe","Übung 3","TEXT","lernen, wichtig","Seite 4\nmitnehmen","N","","2026-10-30T22:00:00+0000","TRIGGER:-PT30M","RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH","5","0","","","1","Europe/Berlin","false","false","","","","t1",""',
      '"Uni","Mathe","Aufgabe a","TEXT","","","N","","","","","0","1","","","2","Europe/Berlin","true","true","","","","t2","t1"',
      '"","","Ganztägig","TEXT","","","N","","2026-10-30T23:00:00+0000","","","1","2","","2026-10-31T10:00:00+0000","3","Europe/Berlin","true","false","","","","t3",""',
    ].join("\n");
    const [a, b] = parseTickTickCsv(csv);
    expect(a).toMatchObject({
      title: "Übung 3", list: "Mathe", folder: "Uni", tags: ["lernen", "wichtig"], priority: 3, done: false,
      dueDate: "2026-10-30", dueTime: "23:00", reminders: [{ offsetMin: 30 }],
      repeat: { freq: "weekly", interval: 1, byWeekday: [1, 4] },
    });
    expect(a.notes).toBe("Seite 4\nmitnehmen");
    expect(a.subtasks).toEqual([{ title: "Aufgabe a", done: true }]);
    expect(b).toMatchObject({ title: "Ganztägig", dueDate: "2026-10-31", dueTime: null, priority: 1, done: true });
    expect(() => parseTickTickCsv("x,y\n1,2")).toThrow();
  });
});

describe("ics", () => {
  it("exports timed, all-day and repeating tasks", () => {
    const base: any = { notes: "", done: false, trashedAt: null, repeat: null, dueTime: null };
    const ics = tasksToIcs([
      { ...base, id: "1", title: "A; B", dueDate: "2026-11-02", dueTime: "09:30" },
      { ...base, id: "2", title: "Tag", dueDate: "2026-11-03", repeat: { freq: "weekly", interval: 2, byWeekday: [1] } },
      { ...base, id: "3", title: "ohne Datum", dueDate: null },
    ], new Date("2026-10-30T10:00:00Z"));
    expect(ics).toContain("DTSTART:20261102T093000");
    expect(ics).toContain("DTEND:20261102T100000");
    expect(ics).toContain("SUMMARY:A\; B");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261103");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO");
    expect(ics).not.toContain("ohne Datum");
    expect(ics.split("BEGIN:VEVENT")).toHaveLength(3);
  });
});
