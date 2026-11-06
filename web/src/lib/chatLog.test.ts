import { describe, expect, it } from "vitest";
import { trimChat } from "./chatLog";

describe("chat history", () => {
  it("keeps the last 20 questions with their answers", () => {
    const all = Array.from({ length: 25 }, (_, i) => [{ me: true, text: `q${i}`, at: i }, { me: false, text: `a${i}`, at: i }]).flat();
    const out = trimChat(all);
    expect(out).toHaveLength(40);
    expect(out[0].text).toBe("q5");
    expect(out.at(-1)!.text).toBe("a24");
    expect(trimChat(all.slice(0, 6))).toHaveLength(6);
  });
});
