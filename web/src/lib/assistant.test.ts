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

  it("falls back to the next model when one is gone (404)", async () => {
    const models: string[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      const m = JSON.parse(String(init.body)).model;
      models.push(m);
      return models.length === 1 ? new Response(JSON.stringify({ error: { code: "model_not_found", message: "gone" } }), { status: 404 }) : reply({ content: "ok" });
    }) as unknown as typeof fetch;
    expect((await runAssistant("x", { defs: [], run: async () => 0 }, "k", { lang: "de", fetch: f })).text).toBe("ok");
    expect(models).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  });

  it("asks Groq for another model when all known ones are gone", async () => {
    const models: string[] = [];
    const f = (async (u: string, init: RequestInit) => {
      if (u.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "whisper-large-v3" }, { id: "openai/gpt-oss-120b" }, { id: "new/chat-model" }] }), { status: 200 });
      const m = JSON.parse(String(init.body)).model;
      models.push(m);
      return m === "new/chat-model" ? reply({ content: "ok" }) : new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    expect((await runAssistant("x", { defs: [], run: async () => 0 }, "k", { lang: "de", fetch: f })).text).toBe("ok");
    expect(models.at(-1)).toBe("new/chat-model");
  });

  it("moves on to the next model on a rate limit", async () => {
    const models: string[] = [];
    const f = (async (_u: string, init: RequestInit) => {
      models.push(JSON.parse(String(init.body)).model);
      return models.length === 1 ? new Response(JSON.stringify({ error: { message: "tpm" } }), { status: 429 }) : reply({ content: "ok" });
    }) as unknown as typeof fetch;
    expect((await runAssistant("x", { defs: [], run: async () => 0 }, "k", { lang: "de", fetch: f })).text).toBe("ok");
    expect(models).toEqual(["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
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

  it("matches loosely: word order and endings", () => {
    const items = [{ id: "1", t: "Mathe Hausaufgaben abgeben" }, { id: "2", t: "Zahnarzt Termin" }];
    const t = (x: { t: string }) => x.t;
    expect(matchByName("hausaufgabe mathe", items, t).hit?.id).toBe("1");
    expect(matchByName("termin zahnarztes", items, t).hit?.id).toBe("2");
  });

  it("hands the app state to the model", async () => {
    const bodies: any[] = [];
    const tools: Tools = { defs: [], run: async () => ({}), context: async () => "Offene Aufgaben:\n- Steuer" };
    await runAssistant("hi", tools, "k", { lang: "de", fetch: (async (_u: any, init: any) => { bodies.push(JSON.parse(init.body)); return reply({ content: "ok" }); }) as any });
    expect(bodies[0].messages[0].content).toContain("- Steuer");
    expect(bodies[0].messages[0].content).toContain("add_done");
    expect(bodies[0].messages[0].content).toMatch(/Kalender: [A-Z][a-z] \d{4}-\d\d-\d\d, /);
  });
});
