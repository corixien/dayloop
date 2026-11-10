import { describe, expect, it } from "vitest";
import { easter, infoByDay, infoRanges } from "./infoDates";

describe("info dates", () => {
  it("computes Easter and the moving holidays", () => {
    expect(easter(2026)).toBe("2026-04-05");
    expect(easter(2027)).toBe("2027-03-28");
    const names = (y: number) => new Map(infoRanges(`${y}-01-01`, `${y}-12-31`, "de").map((i) => [i.title, i.date]));
    const n = names(2027);
    expect(n.get("Karfreitag")).toBe("2027-03-26");
    expect(n.get("Christi Himmelfahrt / Vatertag")).toBe("2027-05-06");
    expect(n.get("Pfingstmontag")).toBe("2027-05-17");
    expect(n.get("Muttertag")).toBe("2027-05-09");
    expect(n.get("Sommerzeit beginnt")).toBe("2027-03-28");
    expect(n.get("Winterzeit beginnt")).toBe("2027-10-31");
    expect(names(2026).get("Muttertag")).toBe("2026-05-10");
  });

  it("lists ranges on every day, the label on the first visible day only", () => {
    const days = ["2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25"];
    const m = infoByDay(days, "de", [{ id: "1", title: "Eigen", date: "2026-12-24", endDate: null }]);
    expect(m.get("2026-12-22")).toBeUndefined();
    expect(m.get("2026-12-23")!.map((i) => [i.title, i.first])).toEqual([["Weihnachtsferien", true]]);
    expect(m.get("2026-12-25")!.find((i) => i.title === "Weihnachtsferien")!.first).toBe(false);
    expect(m.get("2026-12-24")!.map((i) => i.title).sort()).toEqual(["Eigen", "Heiligabend", "Weihnachtsferien"]);
    // a range that started before the visible window gets its label on the first visible day
    expect(infoByDay(["2026-12-25"], "de").get("2026-12-25")!.find((i) => i.title === "Weihnachtsferien")!.first).toBe(true);
  });
});
