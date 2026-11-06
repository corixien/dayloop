import { describe, expect, it } from "vitest";
import { formatNotes, noteStats, parseMarks, parseNotes, stripMarks, toggleMark, uncheckAll } from "./notes";

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

describe("checklist completion time", () => {
  it("keeps and resets timestamps", async () => {
    const { doneItems } = await import("./notes");
    const n = "- [x@1730000000000] a\n- [x] old\n- [ ] b";
    expect(doneItems(n)).toEqual([{ text: "a", at: 1730000000000 }]);
    expect(formatNotes(parseNotes(n))).toBe(n);
    expect(uncheckAll(n)).toBe("- [ ] a\n- [x] old\n- [ ] b".replace("- [x] old", "- [ ] old"));
    expect(noteStats(n)).toEqual({ total: 3, done: 2, first: "" });
  });
});

describe("inline marks", () => {
  it("parses bold, italic and both; stray asterisks stay plain", () => {
    expect(parseMarks("a **b** *c* ***d*** 3 * 4 * 5").map((s) => [s.text, !!s.bold, !!s.italic])).toEqual([
      ["a ", false, false], ["b", true, false], [" ", false, false], ["c", false, true], [" ", false, false], ["d", true, true], [" 3 * 4 * 5", false, false],
    ]);
    expect(stripMarks("**Milch** und *Brot*")).toBe("Milch und Brot");
  });
  it("toggles marks on a selection, a word and back", () => {
    expect(toggleMark("Milch kaufen", 0, 5, "**")).toEqual({ text: "**Milch** kaufen", s: 2, e: 7 });
    expect(toggleMark("**Milch** kaufen", 2, 7, "**").text).toBe("Milch kaufen");
    expect(toggleMark("Milch kaufen", 2, 2, "*").text).toBe("*Milch* kaufen");
    expect(toggleMark("", 0, 0, "**")).toEqual({ text: "****", s: 2, e: 2 });
  });
  it("keeps notes stats free of markers", () => {
    expect(noteStats("**Wichtig** zuerst\n- [ ] *a*").first).toBe("Wichtig zuerst");
  });
});
