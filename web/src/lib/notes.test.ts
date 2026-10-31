import { describe, expect, it } from "vitest";
import { formatNotes, noteStats, parseNotes, uncheckAll } from "./notes";

describe("notes checklist", () => {
  it("round-trips and counts", () => {
    const n = "Intro\n- [ ] a\n- [x] b";
    expect(formatNotes(parseNotes(n))).toBe(n);
    expect(noteStats(n)).toEqual({ total: 2, done: 1, first: "Intro" });
    expect(noteStats("- [x] only").first).toBe("");
  });
  it("unchecks for the next repeat", () => {
    expect(uncheckAll("- [x] a\ntext - [x]\n- [ ] b")).toBe("- [ ] a\ntext - [x]\n- [ ] b");
  });
});
