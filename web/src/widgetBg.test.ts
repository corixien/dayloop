import { describe, expect, it } from "vitest";
import { build } from "./widgetBg";

const env = (id: string, data: object) => ({ id, data, updatedAt: 1 });

describe("headless widget build", () => {
  it("builds the same lists from raw server items (defaults filled, pending completion applied)", () => {
    const snap = build({
      lang: "de", hour: 9, sent: null, now: new Date(2026, 10, 10, 10, 0).getTime(),
      tasks: [env("a", { title: "Alt" }), env("b", { title: "Neu", priority: 3 }), env("c", { title: "Weg", trashedAt: 5 })],
      plans: [env("p", { title: "Schule", date: "2026-11-10", start: "08:00", end: "09:00" })],
      pending: [{ id: "a", done: true, at: new Date(2026, 10, 10, 9, 0).getTime() }],
    });
    const titles = (rows: { k: string; title: string }[]) => rows.filter((r) => r.k === "t").map((r) => r.title);
    expect(titles(snap.todo)).toEqual(["Neu"]);
    expect(titles(snap.done)).toEqual(["Alt"]);
    expect(titles(snap.plan)).toEqual(["Schule"]);
    expect(snap.lang).toBe("de");
  });
});
