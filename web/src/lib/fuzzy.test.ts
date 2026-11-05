import { describe, expect, it } from "vitest";
import { fuzzyScore } from "./fuzzy";

describe("fuzzyScore", () => {
  it("ranks exact > prefix > word > substring", () => {
    const s = (t: string) => fuzzyScore("gassi", t);
    expect(s("Gassi")).toBeGreaterThan(s("Gassi gehen"));
    expect(s("Gassi gehen")).toBeGreaterThan(s("Mit Gassi los"));
    expect(s("Mit Gassi los")).toBeGreaterThan(s("Abgassicherung"));
  });
  it("tolerates typos, word order and diacritics", () => {
    expect(fuzzyScore("kassi", "Gassi gehen")).toBeGreaterThan(0);
    expect(fuzzyScore("zahn arzt", "Zahnarzt Termin vereinbaren")).toBeGreaterThan(0);
    expect(fuzzyScore("termin zahnarzt", "Zahnarzt Termin vereinbaren")).toBeGreaterThan(50);
    expect(fuzzyScore("ubung", "Übungsartefact fertig machen")).toBeGreaterThan(80);
    expect(fuzzyScore("klz", "Klausur zusammenfassen")).toBeGreaterThan(0);
  });
  it("does not match unrelated text", () => {
    expect(fuzzyScore("pizza", "Zahnarzt Termin vereinbaren")).toBe(0);
    expect(fuzzyScore("xyz", "Kalender")).toBe(0);
  });
});
