import { expect, it } from "vitest";
import { TrackerError, sendToTracker } from "./tracker";

const cfg = { url: "https://pt.test", username: "mat", password: "secret123" };
const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

it("logs in, rates, creates and completes one task for all entries", async () => {
  const calls: { path: string; body: any; auth?: string | null }[] = [];
  const fake = ((url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    calls.push({ path, body: JSON.parse(String(init.body)), auth: (init.headers as any).Authorization });
    if (path === "/api/auth/login") return reply(200, { token: "jwt1" });
    if (path === "/api/groq") return reply(200, { name: "Uni und Sport", duration: 90, productivity: 4, difficulty: 3, category: "learning", bonus: false, xp: 20 });
    if (path === "/api/tasks") return reply(201, { id: "t9", name: "Uni und Sport" });
    return reply(200, { xpEarned: 21 });
  }) as unknown as typeof fetch;

  const r = await sendToTracker(cfg, [{ title: "Mathe lernen", notes: "Kapitel 4" }, { title: "Joggen" }], "de", fake);
  expect(r).toEqual({ name: "Uni und Sport", duration: 90, xp: 21 });
  expect(calls.map((c) => c.path)).toEqual(["/api/auth/login", "/api/groq", "/api/tasks", "/api/tasks/t9/complete"]);
  expect(calls[1].body.description).toBe("- Mathe lernen (Kapitel 4)\n- Joggen");
  expect(calls[1].auth).toBe("Bearer jwt1");
  expect(calls[2].body).toMatchObject({ name: "Uni und Sport", duration: 90, category: "learning", bonus: 0 });
});

it("maps failures to typed errors", async () => {
  const bad = (status: number) => (() => reply(status, { error: "x" })) as unknown as typeof fetch;
  await expect(sendToTracker(cfg, [{ title: "a" }], "de", bad(401))).rejects.toMatchObject({ code: "auth" });
  await expect(sendToTracker(cfg, [{ title: "a" }], "de", (() => Promise.reject(new TypeError("net"))) as unknown as typeof fetch)).rejects.toBeInstanceOf(TrackerError);
  let n = 0;
  const aiDown = ((url: string) => (new URL(url).pathname === "/api/auth/login" ? reply(200, { token: "t" }) : (n++, reply(502, { error: "AI down" })))) as unknown as typeof fetch;
  await expect(sendToTracker(cfg, [{ title: "a" }], "en", aiDown)).rejects.toMatchObject({ code: "ai" });
  expect(n).toBe(1);
});
