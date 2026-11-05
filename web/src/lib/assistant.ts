/** Voice assistant: Groq Whisper for speech to text, a Groq chat model with tools to act on the app. Key stays on the device. */
const GROQ = "https://api.groq.com/openai/v1";
export const KEY = "dl_groq";
export const WHISPER = "whisper-large-v3-turbo";
/** Tried in order; a model Groq retired answers 404 and the next one is used (llama-3.3-70b-versatile was shut down); when all are gone, `discoverModel` asks Groq what exists. */
export const CHAT_MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];

export const getGroqKey = () => localStorage.getItem(KEY) ?? "";
export interface ToolDef { name: string; description: string; parameters: object }
export interface Tools {
  defs: ToolDef[]; run(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** current app state (open tasks, habits) handed to the model so it can refer to what exists */
  context?(): Promise<string>;
}
type Msg = { role: string; content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string };

export class AssistantError extends Error {
  /** detail: HTTP status and the provider's message, shown to the user to make failures diagnosable */
  constructor(public code: "auth" | "network" | "rate" | "other", public detail = "", public retryAfter = 0) { super(code); }
}

async function groq(path: string, key: string, init: RequestInit, f: typeof fetch) {
  let res: Response;
  try { res = await f(GROQ + path, { ...init, headers: { Authorization: `Bearer ${key}`, ...init.headers } }); } catch { throw new AssistantError("network"); }
  if (res.ok) return res.json() as Promise<any>;
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
  const detail = `${res.status} ${body.error?.code ?? ""} ${body.error?.message ?? ""}`.trim().slice(0, 200);
  throw new AssistantError(res.status === 401 || res.status === 403 ? "auth" : res.status === 429 ? "rate" : "other", detail, Number(res.headers.get("retry-after")) || 0);
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

/**
 * Second pass over a spoken sentence: speech recognition often turns a word into a similar-sounding non-word
 * ("Kassi gehen" for "Gassi gehen"). A small model repairs such slips using the sentence and the app's own names.
 * Never fails: on any problem (offline, limits, odd answer) the original text is used.
 */
export async function cleanTranscript(text: string, key: string, lang: string, context = "", f: typeof fetch = (...a) => fetch(...a)): Promise<string> {
  const src = text.trim();
  if (src.length < 4) return text;
  const system = lang === "de"
    ? "Du korrigierst Erkennungsfehler in einem gesprochenen deutschen Satz für eine Todo-App. Ersetze Wörter, die es so nicht gibt oder im Zusammenhang keinen Sinn ergeben, durch das, was der Sprecher mit größter Wahrscheinlichkeit gesagt hat (z. B. „Kassi gehen“ -> „Gassi gehen“, „Zahn Arzt“ -> „Zahnarzt“, „Mathe Hausaufgabe fertig“ bleibt). Nutze dafür den Satzzusammenhang und die Namen aus der App unten. Ändere sonst nichts: gleiche Bedeutung, gleiche Zeitform, keine neuen Informationen, keine Antwort, keine Erklärung. Gib ausschließlich den korrigierten Satz aus."
    : "You fix recognition errors in a spoken sentence for a todo app. Replace words that do not exist or make no sense in context with what the speaker most likely said, using the sentence and the app's own names below. Change nothing else: same meaning, same tense, no new information, no answer, no explanation. Output only the corrected sentence.";
  for (const model of ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]) {
    try {
      const r = await groq("/chat/completions", key, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature: 0, max_completion_tokens: 600, reasoning_effort: "low", messages: [{ role: "system", content: system + (context ? `\n\n${context.slice(0, 1500)}` : "") }, { role: "user", content: src }] }),
      }, f);
      const out = String(r.choices?.[0]?.message?.content ?? "").trim().replace(/^["„“]+|["“”]+$/g, "").trim();
      // plausibility: one line, about the same length (a model that answers instead of correcting is ignored)
      if (out && !out.includes("\n") && out.length >= src.length * 0.5 && out.length <= src.length * 1.6 + 12) return out;
      return text;
    } catch { /* next model */ }
  }
  return text;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WD_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WD_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function systemPrompt(lang: string, now: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const wd = (lang === "de" ? WD_DE : WD_EN)[now.getDay()];
  // models miscalculate weekdays: hand them the next two weeks
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() + i);
    return `${(lang === "de" ? WD_DE : WD_EN)[d.getDay()].slice(0, 2)} ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }).join(", ");
  return lang === "de"
    ? `Du bist der Sprachassistent der Todo-App Dayloop. Heute ist ${wd}, ${date}, ${p(now.getHours())}:${p(now.getMinutes())} Uhr. Führe Wünsche sofort mit den Werkzeugen aus, ohne nachzufragen. Datum als YYYY-MM-DD, Uhrzeit als HH:mm, Priorität 0-3 (3 = hoch). Die Spracherkennung macht Fehler: gleiche Namen großzügig mit der Liste unten ab und nimm die ähnlichste Aufgabe/Gewohnheit. Wörter, die es so nicht gibt (z.B. "Kassi gehen"), sind Hörfehler: schreibe Titel in der wahrscheinlich gemeinten, korrekten Form ("Gassi gehen").

Kalender: ${days}

Regeln:
1. Schon Erledigtes (Vergangenheit: "war gassi", "habe X gemacht", "hab X erledigt", "X ist fertig") -> add_done mit dem Titel (Infinitiv-Stil, z.B. "Gassi gehen"). Existiert dazu eine passende offene Aufgabe in der Liste unten, rufe NUR complete_task dafür auf und niemals zusätzlich add_done. Nie als offene Aufgabe anlegen.
2. Noch zu Erledigendes ("ich muss", "erinnere mich", "plane", "Aufgabe") -> add_task.
3. Braucht eine Sache mehrere Schritte ("dafür muss ich A, B und C tun", "dazu gehören ...", "Unteraufgaben"): EINE Aufgabe mit checklist = [A, B, C]. Gibt es die Hauptaufgabe schon (siehe Liste), hänge die Schritte mit add_checklist_item daran, lege keine neuen Aufgaben an. Sagt der Nutzer "dafür"/"dazu" ohne Namen, meint er die zuletzt genannte Aufgabe.
4. Mehrere voneinander unabhängige Dinge -> je eine eigene Aufgabe.
5. Hat der Nutzer etwas getan, das zu einer bestehenden Gewohnheit passt (z.B. Wasser getrunken, Sport gemacht) -> log_habit statt Aufgabe. Neue Gewohnheiten (create_habit) nur, wenn er ausdrücklich "Gewohnheit"/"Habit" sagt; "erinnere mich jeden Montag an X" ist eine Aufgabe mit Wiederholung (add_task mit repeat).
6. Relative Angaben ("morgen", "Freitag", "in zwei Tagen", "abends 18 Uhr") selbst in Datum/Uhrzeit umrechnen.
7. Mehrere Wünsche in einem Satz: alle nacheinander ausführen.
8. Wiederholung ("jeden Montag", "täglich", "monatlich"): add_task mit repeat (daily/weekly/monthly/yearly) UND dueDate = nächster passender Tag (selbst berechnen).
9. Nennt der Nutzer einen Punkt, der in der Liste unten als Checklistenpunkt ([ ]) einer Aufgabe steht ("X abhaken", "X ist erledigt", "X ist gemacht"): tick_checklist_item mit query = Aufgabe und item = Punkt. Nie als neue Aufgabe oder Checklistenpunkt anlegen und nicht die ganze Aufgabe erledigen.
10. Meldet ein Werkzeug "ambiguous" (mehrere ähnliche Aufgaben), ändere NICHTS und frage kurz, welche gemeint ist. Erledige nie mehrere Aufgaben auf Verdacht.
Antworte danach mit einem kurzen deutschen Satz, was getan wurde; bei Auflistungen kurze Zeilen. Keine Förmlichkeiten.`
    : `You are the voice assistant of the todo app Dayloop. Today is ${wd}, ${date}, ${p(now.getHours())}:${p(now.getMinutes())}. Carry out requests right away with the tools, without asking. Dates as YYYY-MM-DD, times as HH:mm, priority 0-3 (3 = high). Speech recognition makes mistakes: match names loosely against the list below and pick the most similar task/habit. Words that do not exist (e.g. "Kassi gehen") are mishearings: write titles in the most likely intended, correct form ("Gassi gehen").

Rules:
1. Already finished things (past tense: "I walked the dog", "I did X", "X is done") -> add_done with the title (infinitive style, e.g. "Walk the dog"). If a matching open task exists in the list below, call ONLY complete_task for it and never add_done in addition. Never create them as open tasks.
2. Things still to do ("I need to", "remind me", "plan", "task") -> add_task.
3. If one thing needs several steps ("for that I have to A, B and C", "this includes ...", "subtasks"): ONE task with checklist = [A, B, C]. If the main task already exists (see list), add ALL steps in one add_checklist_item call (items) and do not create new tasks. If the user says "for that" without a name, they mean the task mentioned last.
4. Several independent things -> one task each.
5. If the user did something matching an existing habit (drank water, exercised) -> log_habit instead of a task. Create habits (create_habit) only when the user explicitly says "habit"; "remind me every Monday to X" is a task with a repeat (add_task with repeat).
6. Convert relative expressions ("tomorrow", "Friday", "in two days", "6 pm") to date/time yourself.
7. Several requests in one sentence: carry out all of them in turn.
8. Repetition ("every Monday", "daily", "monthly"): add_task with repeat (daily/weekly/monthly/yearly) AND dueDate = next matching day (work it out yourself).
9. If the user names an item that appears below as a checklist item ([ ]) of a task ("tick X", "X is done"): tick_checklist_item with query = task and item = the item. Never create it as a new task or checklist item and do not complete the whole task.
10. If a tool reports "ambiguous" (several similar tasks), change NOTHING and briefly ask which one is meant. Never complete several tasks on suspicion.
Then answer in one short sentence saying what was done; for lists use short lines. No pleasantries.`;
}

/** Last resort when every known model answers 404: pick any other chat model Groq currently offers. */
async function discoverModel(key: string, tried: string[], f: typeof fetch): Promise<string | null> {
  const ids: string[] = ((await groq("/models", key, {}, f).catch(() => ({ data: [] }))).data ?? []).map((m: { id: string }) => m.id);
  return ids.find((id) => !tried.includes(id) && !/whisper|guard|orpheus|safeguard|allam|tts/i.test(id)) ?? null;
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
  let model = 0, waited = 0;
  const models = [...CHAT_MODELS];
  for (let round = 0; round < 8; round++) {
    let r: any;
    // a malformed tool call (HTTP 400 tool_use_failed) usually works on a second try; an unknown model (404) moves on to the next one
    for (let attempt = 0; ; attempt++) {
      const body = JSON.stringify({
        model: models[model], temperature: 0.2, messages, tool_choice: "auto",
        ...(models[model].startsWith("openai/") ? { reasoning_effort: "medium" } : {}),
        tools: tools.defs.map((d) => ({ type: "function", function: d })),
      });
      try { r = await groq("/chat/completions", key, { method: "POST", headers: { "Content-Type": "application/json" }, body }, f); break; }
      catch (e) {
        if (!(e instanceof AssistantError)) throw e;
        if (e.detail.startsWith("404")) {
          if (model < models.length - 1) { model++; continue; }
          const found = await discoverModel(key, models, f);
          if (found) { models.push(found); model++; continue; }
        }
        // every model has its own free-tier quota: a rate limit moves on to the next one; when all are used up, wait once
        if (e.code === "rate") {
          if (model < models.length - 1) { model++; continue; }
          if (waited < 3 && e.retryAfter <= 40) { waited++; await sleep(Math.max(6, e.retryAfter + 1) * 1000); model = 0; continue; }
        }
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
