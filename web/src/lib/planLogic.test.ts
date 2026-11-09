import { describe, expect, it } from "vitest";
import { checkRange, defaultEnd, fromMin, nextStart, toMin } from "./planLogic";

const b = (start: string, end: string) => ({ start, end });

describe("plan logic", () => {
  it("converts times", () => {
    expect(toMin("13:30")).toBe(810);
    expect(fromMin(810)).toBe("13:30");
    expect(fromMin(5000)).toBe("23:59");
  });
  it("starts a new block after the last one, but not in the past", () => {
    expect(nextStart([b("11:00", "12:00")], 10 * 60 + 12)).toBe("12:00");
    expect(nextStart([b("11:00", "12:00")], 13 * 60 + 7)).toBe("13:05");
    expect(nextStart([], 9 * 60 + 41)).toBe("09:40");
    expect(nextStart([b("09:00", "10:30"), b("08:00", "08:30")], null)).toBe("10:30");
    expect(nextStart([], null)).toBe("08:00");
  });
  it("default end is one hour later, clamped", () => {
    expect(defaultEnd("12:00")).toBe("13:00");
    expect(defaultEnd("23:30")).toBe("23:59");
    expect(defaultEnd("12:00", 30)).toBe("12:30");
  });
  it("validates ranges", () => {
    expect(checkRange("09:00", "10:00")).toBeNull();
    expect(checkRange("10:00", "10:00")).toBe("order");
    expect(checkRange("9:00", "10:00")).toBe("format");
  });
});
