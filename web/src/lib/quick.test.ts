import { describe, expect, it } from "vitest";
import { parseQuick } from "./nlp";

describe("quick create", () => {
  it("turns what follows a colon into checklist items", () => {
    expect(parseQuick("Referat: recherchieren, Folien machen und üben").items).toEqual(["recherchieren", "Folien machen", "üben"]);
    expect(parseQuick("Referat: recherchieren, Folien machen und üben").title).toBe("Referat");
  });
  it("keeps times intact", () => {
    const p = parseQuick("Zahnarzt morgen 15:00");
    expect(p.items).toEqual([]);
    expect(p.dueTime).toBe("15:00");
  });
});
