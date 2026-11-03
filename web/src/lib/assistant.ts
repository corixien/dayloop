/** Voice assistant: Groq Whisper for speech to text, a Groq chat model with tools to act on the app. Key stays on the device. */
const GROQ = "https://api.groq.com/openai/v1";
const KEY = "dl_groq";
export const WHISPER = "whisper-large-v3-turbo";
/** Tried in order; a model Groq retired answers 404 and the next one is used (llama-3.3-70b-versatile was shut down). */
export const CHAT_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"];

export const getGroqKey = () => localStorage.getItem(KEY) ?? "";
export const saveGroqKey = (k: string) => (k.trim() ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY));

export interface ToolDef { name: string; description: string; parameters: object }
export interface Tools {
  defs: ToolDef[]; run(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** current app state (open tasks, habits) handed to the model so it can refer to what exists */
  context?(): Promise<string>;
}
type Msg = { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string };

export class AssistantError extends Error {
  /** detail: HTTP status and the provider's message, shown to the user to make failures diagnosable */
  constructor(public code: "auth" | "network" | "rate" | "other", public detail = "") { super(code); }
}

async function groq(path: string, key: string, init: RequestInit, f: typeof fetch) {
  let res: Response;
  try { res = await f(GROQ + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...init.headers } }); } catch { throw new AssistantError("network"); }
  if (res.ok) return res.json() as Promise<any>;
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
  const detail = `${res.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`.trim().slice(0, 200);
  throw new AssistantError(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate" : "other", detail);
}

/** hint: names from the app (tasks, habits) that steer Whisper towards the user's own vocabulary */
export async function transcribe(blob: Blob, key: string, lang: string, f: typeof fetch = (...a) => fetch(...a), hint = ""): Promise<string> {
  const form = new FormData();
  // the recorder's type carries codec parameters ("audio/webm;codecs=opus") that the API rejects
  const mp4 = blob.type.includes("mp4");
  form.append("file", new Blob([blob], { type: mp4 ? "audio/mp4" : "audio/webm" }), mp4 ? "audio.m4a" : "audio.webm");
  form.append("model", WHISPER);
  form.append("language", lang);
  if (hint) form.append("prompt", hint.slice(0, 500));
  form.append("response_format", "json");
  return ((await groq("/audio/transcriptions", key, { method: "POST", body: form }, f)).text ?? "").trim();
}

const WD_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WD_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function systemPrompt(lang: string, now: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const wd = (lang === "de" ? WD_DE : WD_EN)[now.getDay()];
  return lang === "de"
    ? `Du bist der Sprachassistent der Todo-App Dayloop. Heute ist ${wd}, ${date}, ${p(now.getHours())}:${p(now.getMinutes())} Uhr. Führe Wünsche sofort mit den Werkzeugen aus, ohne nachzufragen. Datum als YYYY-MM-DD, Uhrzeit als HH:mm, Priorität 0-3 (3 = hoch). Die Spracherkennung macht Fehler: gleiche Namen großzügig mit der Liste unten ab und nimm die ähnlichste Aufgabe/Gewohnheit.

Regeln:
1. Schon Erledigtes (Vergangenheit: "war gassi", "habe X gemacht", "hab X erledigt", "X ist fertig") -> add_done mit dem Titel (Infinitiv-Stil, z.B. "Gassi gehen"). Existiert dazu eine offene Aufgabe, stattdessen complete_task. Nie als offene Aufgabe anlegen.
2. Noch zu Erledigendes ("ich muss", "erinnere mich", "plane", "Aufgabe") -> add_task.
3. Braucht eine Sache mehrere Schritte ("dafür muss ich A, B und C tun", "dazu gehören ...", "Unteraufgaben"): EINE Aufgabe mit checklist = [A, B, C]. Gibt es die Hauptaufgabe schon (siehe Liste), hänge die Schritte mit add_checklist_item daran, lege keine neuen Aufgaben an. Sagt der Nutzer "dafür"/"dazu" ohne Namen, meint er die zuletzt genannte Aufgabe.
4. Mehrere voneinander unabhängige Dinge -> je eine eigene Aufgabe.
5. Gewohnheiten (täglich/regelmäßig, z.B. Wasser trinken, Sport) -> log_habit statt Aufgabe, wenn die Gewohnheit existiert.
6. Relative Angaben ("morgen", "Freitag", "in zwei Tagen", "abends 18 Uhr") selbst in Datum/Uhrzeit umrechnen.
7. Mehrere Wünsche in einem Satz: alle nacheinander ausführen.
Antworte danach mit einem kurzen deutschen Satz, was getan wurde; bei Auflistungen kurze Zeilen. Keine Förmlichkeiten.`
    : `You are the voice assistant of the todo app Dayloop. Today is ${wd}, ${date}, ${p(now.getHours())}:${p(now.getMinutes())}. Carry out requests right away with the tools, without asking. Dates as YYYY-MM-DD, times as HH:mm, priority 0-3 (3 = high). Speech recognition makes mistakes: match names loosely against the list below and pick the most similar task/habit.

Rules:
1. Already finished things (past tense: "I walked the dog", "I did X", "X is done") -> add_done with the title (infinitive style, e.g. "Walk the dog"). If an open task for it exists, use complete_task instead. Never create them as open tasks.
2. Things still to do ("I need to", "remind me", "plan", "task") -> add_task.
3. If one thing needs several steps ("for that I have to A, B and C", "this includes ...", "subtasks"): ONE task with checklist = [A, B, C]. If the main task already exists (see list), add the steps with add_checklist_item and do not create new tasks. If the user says "for that" without a name, they mean the task mentioned last.
4. Several independent things -> one task each.
5. Habits (daily/regular, e.g. drink water, exercise) -> log_habit instead of a task when the habit exists.
6. Convert relative expressions ("tomorrow", "Friday", "in two days", "6 pm") to date/time yourself.
7. Several requests in one sentence: carry out all of them in turn.
Then answer in one short sentence saying what was done; for lists use short lines. No pleasantries.`;
}

export interface RunResult { text: string; actions: string[] }

/** One user utterance: let the model call tools until it answers in text. */
export async function runAssistant(
  input: string, tools: Tools, key: string, opts: { lang: string; now?: Date; fetch?: typeof fetch },
): Promise<RunResult> {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const state = (await tools.context?.().catch(() => "")) ?? "";
  const messages: Msg[] = [{ role: "system", content: systemPrompt(opts.lang, opts.now ?? new Date()) + (state ? `\n\n${state}` : "") }, { role: "user", content: input }];
  const actions: string[] = [];
  let model = 0;
  for (let round = 0; round < 8; round++) {
    let r: any;
    // a malformed tool call (HTTP 400 tool_use_failed) usually works on a second try; an unknown model (404) moves on to the next one
    for (let attempt = 0; ; attempt++) {
      const body = JSON.stringify({
        model: CHAT_MODELS[model], temperature: 0.2, messages, tool_choice: "auto",
        ...(CHAT_MODELS[model].startsWith("openai/") ? { reasoning_effort: "medium" } : {}),
        tools: tools.defs.map((d) => ({ type: "function", function: d })),
      });
      try { r = await groq("/chat/completions", key, { method: "POST", headers: { "Content-Type": "application/json" }, body }, f); break; }
      catch (e) {
        if (!(e instanceof AssistantError)) throw e;
        if (e.detail.startsWith("404") && model < CHAT_MODELS.length - 1) { model++; continue; }
        if (e.detail.includes("tool_use_failed") && attempt < 3) continue;
        throw e;
      }
    }
    const msg: Msg | undefined = r.choices?.[0]?.message;
    if (!msg) throw new AssistantError("other");
    if (!msg.tool_calls?.length) return { text: (msg.content ?? "").trim(), actions };
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const c of msg.tool_calls) {
      let out: unknown;
      try {
        out = await tools.run(c.function.name, JSON.parse(c.function.arguments || "{}"));
        actions.push(c.function.name);
      } catch (e) {
        out = { error: e instanceof Error ? e.message : "failed" };
      }
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
    }
  }
  return { text: "", actions };
}

/** Find an item by spoken name: exact, then prefix, then substring (case/diacritics-insensitive). */
export function matchByName<T extends { id: string }>(query: string, items: T[], name: (x: T) => string): { hit?: T; candidates: T[] } {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const q = norm(query);
  if (!q) return { candidates: [] };
  for (const test of [(n: string) => n === q, (n: string) => n.startsWith(q), (n: string) => n.includes(q)]) {
    const m = items.filter((x) => test(norm(name(x))));
    if (m.length === 1) return { hit: m[0], candidates: m };
    if (m.length > 1) return { candidates: m };
  }
  // speech recognition drifts: every spoken word must start like some word of the name (handles word order and endings)
  const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const qw = words(query);
  if (qw.length) {
    const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2));
    const m = items.filter((x) => { const nw = words(name(x)); return qw.every((w) => nw.some((n) => n.startsWith(stem(w)) || w.startsWith(stem(n)))); });
    if (m.length === 1) return { hit: m[0], candidates: m };
    if (m.length > 1) return { candidates: m };
  }
  return { candidates: [] };
}
