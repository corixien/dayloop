/**
 * Live evaluation of the voice assistant against the real Groq API with the real app tools on an in-memory database.
 * Skipped unless GROQ_KEY is set:  GROQ_KEY=gsk_... npx vitest run src/lib/assistant.live.test.ts
 * Every scenario runs REPEAT times (default 2); a scenario passes only if all runs pass.
 */
import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";

const KEY = process.env.GROQ_KEY ?? "";
const REPEAT = Number(process.env.REPEAT ?? 2);
const ONLY = process.env.ONLY;

type Mod = { app: typeof import("./app"); tools: typeof import("./assistantTools"); asst: typeof import("./assistant") };
let m: Mod;

beforeAll(async () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  (globalThis as any).window = { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, Capacitor: undefined };
  (globalThis as any).document = { addEventListener() {}, visibilityState: "visible" };
  (globalThis as any).navigator ??= { language: "de-DE" };
  m = { app: await import("./app"), tools: await import("./assistantTools"), asst: await import("./assistant") };
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return day(d); };

async function reset() {
  const { local } = m.app;
  for (const t of ["task", "habit", "habitlog", "motext", "mofeed", "moaudio"] as const) for (const x of await local.all(t)) await local.remove(t, x.id);
}
const task = (title: string, extra: object = {}) => m.app.local.put("task", crypto.randomUUID(), { title, ...extra });
const habit = (name: string, target = 1) => m.app.local.put("habit", crypto.randomUUID(), { name, target, startDate: "2026-01-01" });

async function ask(utterance: string) {
  for (let i = 0; ; i++) {
    try { return await m.asst.runAssistant(utterance, m.tools.appTools, KEY, { lang: "de" }); }
    catch (e: any) { if (e?.code === "rate" && i < 8) { await sleep(15_000); continue; } throw e; }
  }
}
const open = async () => (await m.app.local.all("task")).filter((t) => !t.done && !t.trashedAt);
const done = async () => (await m.app.local.all("task")).filter((t) => t.done && !t.trashedAt);
const trashed = async () => (await m.app.local.all("task")).filter((t) => t.trashedAt);
const has = (s: string, w: string) => s.toLowerCase().includes(w.toLowerCase());
const checklist = (notes: string) => notes.split("\n").filter((l) => l.startsWith("- [")).map((l) => l.replace(/^- \[.[^\]]*\] /, ""));

interface Scenario { name: string; seed?: () => Promise<unknown>; say: string; check: (r: { text: string; actions: string[] }) => Promise<void> }
const S: Scenario[] = [
  { name: "past tense -> Have Done, not todo", say: "Ich war gerade mit dem Hund Gassi.",
    check: async () => { expect((await done()).some((t) => has(t.title, "gassi"))).toBe(true); expect((await open()).length).toBe(0); } },
  { name: "past tense with 'habe ... erledigt' for something unknown", say: "Ich habe die Steuererklärung gemacht.",
    check: async () => { expect((await done()).some((t) => has(t.title, "steuer"))).toBe(true); expect((await open()).length).toBe(0); } },
  { name: "future -> open task with tomorrow's date", say: "Ich muss morgen den Müll rausbringen.",
    check: async () => { const o = await open(); expect(o).toHaveLength(1); expect(has(o[0].title, "müll")).toBe(true); expect(o[0].dueDate).toBe(plus(1)); expect((await done()).length).toBe(0); } },
  { name: "steps spoken for a new task -> one task with checklist", say: "Ich muss das Referat vorbereiten. Dafür muss ich recherchieren, Folien machen und üben.",
    check: async () => { const o = await open(); expect(o).toHaveLength(1); expect(has(o[0].title, "referat")).toBe(true); expect(checklist(o[0].notes).length).toBe(3); } },
  { name: "'dafür' steps attach to the existing task", seed: () => task("Auto waschen"), say: "Dafür muss ich noch eine Bürste, einen Eimer und einen Lappen besorgen.",
    check: async () => { const o = await open(); expect(o).toHaveLength(1); expect(checklist(o[0].notes).length).toBe(3); } },
  { name: "named existing task gets the steps", seed: async () => { await task("Geburtstag planen"); await task("Müll rausbringen"); }, say: "Zum Geburtstag planen gehören Gäste einladen, Kuchen bestellen und Musik aussuchen.",
    check: async () => { const o = await open(); expect(o).toHaveLength(2); const g = o.find((t) => has(t.title, "geburtstag"))!; expect(checklist(g.notes).length).toBe(3); } },
  { name: "inexact name completes the task", seed: async () => { await task("Mathe Hausaufgaben abgeben"); await task("Zahnarzt Termin vereinbaren"); }, say: "Die Hausaufgabe in Mathe ist fertig.",
    check: async () => { expect((await done()).map((t) => t.title)).toEqual(["Mathe Hausaufgaben abgeben"]); } },
  { name: "recognition drift (split word) completes the task", seed: async () => { await task("Zahnarzt Termin vereinbaren"); await task("Wäsche waschen"); }, say: "Zahn Arzt Termin vereinbaren ist erledigt.",
    check: async () => { expect((await done()).map((t) => t.title)).toEqual(["Zahnarzt Termin vereinbaren"]); } },
  { name: "reschedule to a weekday", seed: () => task("Zahnarzt Termin vereinbaren"), say: "Verschieb den Zahnarzt auf nächsten Freitag um 15 Uhr.",
    check: async () => { const t = (await open())[0]; expect(new Date(`${t.dueDate}T00:00`).getDay()).toBe(5); expect(t.dueTime).toBe("15:00"); expect(t.dueDate! > plus(0) || t.dueDate === plus(0)).toBe(true); } },
  { name: "time and priority in one sentence", say: "Erinnere mich heute um 18 Uhr daran, Mama anzurufen, hohe Priorität.",
    check: async () => { const o = await open(); expect(o).toHaveLength(1); expect(o[0].dueDate).toBe(plus(0)); expect(o[0].dueTime).toBe("18:00"); expect(o[0].priority).toBe(3); } },
  { name: "two requests in one sentence", say: "Ich habe die Wäsche gewaschen und muss noch einkaufen gehen.",
    check: async () => { expect((await done()).some((t) => has(t.title, "wäsche"))).toBe(true); expect((await open()).some((t) => has(t.title, "einkauf"))).toBe(true); } },
  { name: "delete by loose name", seed: async () => { await task("Zahnarzt Termin vereinbaren"); await task("Wäsche waschen"); }, say: "Lösch die Aufgabe mit dem Zahnarzt.",
    check: async () => { expect((await trashed()).map((t) => t.title)).toEqual(["Zahnarzt Termin vereinbaren"]); expect((await open()).length).toBe(1); } },
  { name: "tick a checklist item", seed: () => task("Auto waschen", { notes: "- [ ] Bürste kaufen\n- [ ] Eimer holen" }), say: "Hake bei Auto waschen die Bürste ab.",
    check: async () => { const n = (await open())[0].notes; expect(n).toMatch(/- \[x(@\d+)?\] Bürste kaufen/); expect(n).toContain("- [ ] Eimer holen"); } },
  { name: "reopen a finished task", seed: () => task("Müll rausbringen", { done: true, completedAt: Date.now() }), say: "Setz Müll rausbringen wieder auf offen.",
    check: async () => { expect((await open()).map((t) => t.title)).toEqual(["Müll rausbringen"]); } },
  { name: "habit with count", seed: () => habit("Wasser trinken", 8), say: "Ich habe zwei Gläser Wasser getrunken.",
    check: async () => { const l = await m.app.local.all("habitlog"); expect(l.reduce((n, x) => n + ((x as any).count ?? 1), 0)).toBeGreaterThanOrEqual(2); expect((await open()).length).toBe(0); } },
  { name: "ambiguous name does not change anything", seed: async () => { await task("Latein lernen"); await task("Latein Vokabeln"); }, say: "Latein ist erledigt.",
    check: async () => { expect((await done()).length).toBeLessThanOrEqual(1); } },
  { name: "question does not change anything", seed: async () => { await task("Zahnarzt", { dueDate: plus(0) }); await task("Einkaufen", { dueDate: plus(3) }); }, say: "Was habe ich heute noch offen?",
    check: async (r) => { expect((await open()).length).toBe(2); expect((await done()).length).toBe(0); expect(has(r.text, "zahnarzt")).toBe(true); } },
  { name: "motivation text", say: "Schreib mir einen Motivationstext mit dem Titel Durchhalten und dem Inhalt: Aufgeben ist keine Option.",
    check: async () => { const t = await m.app.local.all("motext"); expect(t).toHaveLength(1); expect(has(t[0].title, "durchhalten")).toBe(true); expect(has(t[0].body, "aufgeben")).toBe(true); } },
  { name: "repeating weekly task", say: "Erinnere mich jeden Montag daran, die Blumen zu gießen.",
    check: async () => { const o = await open(); expect(o).toHaveLength(1); expect(o[0].repeat?.freq).toBe("weekly"); expect(new Date(`${o[0].dueDate}T00:00`).getDay()).toBe(1); } },
  { name: "rename a task", seed: () => task("Zahnarzt Termin vereinbaren"), say: "Nenn die Zahnarzt-Aufgabe um in Kieferorthopäde anrufen.",
    check: async () => { expect((await open()).map((t) => t.title)).toEqual(["Kieferorthopäde anrufen"]); } },
  { name: "note on a task", seed: () => task("Einkaufen"), say: "Schreib zur Aufgabe Einkaufen dazu: Milch nicht vergessen.",
    check: async () => { expect(has((await open())[0].notes, "milch")).toBe(true); } },
];

describe.skipIf(!KEY)("assistant live", () => {
  for (const sc of S.filter((s) => !ONLY || has(s.name, ONLY))) {
    it(sc.name, { timeout: 240_000 }, async () => {
      for (let i = 0; i < REPEAT; i++) {
        await reset();
        await sc.seed?.();
        const r = await ask(sc.say);
        try { await sc.check(r); } catch (e) { throw new Error(`run ${i + 1}: ${(e as Error).message}\n  said: "${sc.say}"\n  tools: ${r.actions.join(", ")}\n  answer: ${r.text}`); }
      }
    });
  }
});
