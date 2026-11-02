import { describe, expect, it } from "vitest";
import { type Tools, matchByName, runAssistant } from "./assistant";

const reply = (message: object) => new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });

describe("assistant", () => {
  it("runs the tools the model asks for, then returns its text", async () => {
    const calls: unknown[] = [];
    const tools: Tools = { defs: [{ name: "add_task", description: "", parameters: {} }], run: async (n, a) => { calls.push([n, a]); return { ok: true }; } };
    const bodies: any[] = [];
    const answers = [
      reply({ tool_calls: [{ id: "1", function: { name: "add_task", arguments: '{"title":"Milch","dueDate":"2026-11-03"}' } }] }),
      reply({ content: "Milch ist für morgen eingetragen." }),
    ];
    const f = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return answers.shift()!; }) as unknown as typeof fetch;
    const r = await runAssistant("Milch morgen", tools, "k", { lang: "de", now: new Date(2026, 10, 2, 9, 0), fetch: f });
    expect(calls).toEqual([["add_task", { title: "Milch", dueDate: "2026-11-03" }]]);
    expect(r).toEqual({ text: "Milch ist für morgen eingetragen.", actions: ["add_task"] });
    expect(bodies[0].messages[0].content).toContain("Montag, 2026-11-02");
    expect(bodies[1].messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "1" });
  });

  it("reports tool failures to the model instead of throwing", async () => {
    const tools: Tools = { defs: [], run: async () => { throw new Error("not_found"); } };
    const answers = [reply({ tool_calls: [{ id: "1", function: { name: "x", arguments: "{}" } }] }), reply({ content: "Nicht gefunden." })];
    const bodies: any[] = [];
    const f = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return answers.shift()!; }) as unknown as typeof fetch;
    expect((await runAssistant("x", tools, "k", { lang: "de", fetch: f })).text).toBe("Nicht gefunden.");
    expect(bodies[1].messages.at(-1).content).toContain("not_found");
  });

  it("maps auth errors", async () => {
    const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(runAssistant("x", { defs: [], run: async () => 0 }, "bad", { lang: "de", fetch: f })).rejects.toMatchObject({ code: "auth" });
  });

  it("matches names loosely and reports ambiguity", () => {
    const items = [{ id: "1", t: "Latein Hausaufgaben" }, { id: "2", t: "Latein üben" }, { id: "3", t: "Zahnarzt" }];
    const t = (x: { t: string }) => x.t;
    expect(matchByName("zahnarzt", items, t).hit?.id).toBe("3");
    expect(matchByName("uben", items, t).hit?.id).toBe("2");
    const amb = matchByName("latein", items, t);
    expect(amb.hit).toBeUndefined();
    expect(amb.candidates).toHaveLength(2);
    expect(matchByName("nix", items, t).candidates).toHaveLength(0);
  });
});
