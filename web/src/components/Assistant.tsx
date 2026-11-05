import { Loader2, Mic, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantError, cleanTranscript, getGroqKey, runAssistant, transcribe } from "../lib/assistant";
import { appTools } from "../lib/assistantTools";
import { useLang, useSettings, useT } from "../lib/app";
import { pomo } from "../lib/pomoStore";
import { cx, inputCls } from "./ui";

type Phase = "idle" | "listening" | "thinking";
interface Msg { me: boolean; text: string; err?: boolean }

/** Chat with the assistant: speak (auto-stops on silence) or type; answers appear as chat bubbles. */
export function AssistantPanel({ autoStart }: { autoStart?: boolean }) {
  const t = useT();
  const lang = useLang();
  const settings = useSettings();
  const [phase, setPhase] = useState<Phase>("idle");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typed, setTyped] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const say = (m: Msg) => setMsgs((x) => [...x, m]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [msgs, phase]);
  const rec = useRef<{ stop: () => void } | null>(null);
  const key = getGroqKey();
  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);

  const errText = (e: unknown) => (e instanceof AssistantError ? `${t(`aErr_${e.code}` as "aErr_auth")}${e.detail ? `\n${e.detail}` : ""}` : t("aError"));

  /** voice input is repaired first (misheard words) and shown as the user's message */
  const act = useCallback(async (text: string, spoken = false) => {
    if (!text) return say({ me: false, text: t("aNothingHeard"), err: true });
    setPhase("thinking");
    try {
      let input = text;
      if (spoken) {
        const ctx = await appTools.context?.().catch(() => "");
        input = await cleanTranscript(text, key, lang, ctx);
      }
      say({ me: true, text: input });
      const r = await runAssistant(input, appTools, key, { lang });
      say({ me: false, text: r.text || (r.actions.length ? t("aDone") : t("aError")) });
    } catch (e) {
      say({ me: false, text: errText(e), err: true });
    }
    setPhase("idle");
  }, [key, lang, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const listen = useCallback(async () => {
    if (phase !== "idle") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return say({ me: false, text: t("aMicDenied"), err: true });
    }
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream);
    const ctx = new AudioContext();
    await ctx.resume().catch(() => {}); // started without a tap (power button): the context may begin suspended
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let spoke = false, quiet = 0, ticks = 0, done = false;
    const vad = ctx.state === "running";
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (mr.state !== "inactive") mr.stop();
    };
    const timer = setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      ticks++;
      if (peak > 14) { spoke = true; quiet = 0; } else if (spoke) quiet++;
      // stop after ~1.4 s of silence once something was said, give up after 8 s of nothing, hard cap 30 s
      if ((spoke && quiet > 14) || (!spoke && ticks > 80) || ticks > 300) finish();
    }, 100);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((x) => x.stop());
      void ctx.close();
      rec.current = null;
      const total = chunks.reduce((n, c) => n + c.size, 0);
      // when the level meter could not run, still send what was recorded
      if ((!spoke && vad) || total < 2000) { setPhase("idle"); return say({ me: false, text: t("aNothingHeard"), err: true }); }
      setPhase("thinking");
      try {
        const hint = await appTools.context?.().then((c) => c.replace(/\n- /g, ", ").replace(/\n/g, " ")).catch(() => "");
        await act(await transcribe(new Blob(chunks, { type: mr.mimeType }), key, lang, undefined, hint), true);
      } catch (e) {
        say({ me: false, text: errText(e), err: true });
        setPhase("idle");
      }
    };
    rec.current = { stop: finish };
    mr.start();
    setPhase("listening");
  }, [phase, key, lang, act, t]);

  useEffect(() => { if (autoStart && key) void listen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => rec.current?.stop(), []);

  if (!key) return <p className="px-6 py-8 text-center text-sm text-muted">{t("aNoKey")}</p>;

  const mic = (size: string, icon: number) => (
    <button
      type="button"
      onClick={() => (phase === "listening" ? rec.current?.stop() : void listen())}
      disabled={phase === "thinking"}
      aria-label={t("aMic")}
      className={cx("grid shrink-0 place-items-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 dark:text-[#101012]", size, phase === "listening" ? "animate-pulse bg-danger" : "bg-accent")}
    >
      {phase === "thinking" ? <Loader2 size={icon} className="animate-spin" /> : phase === "listening" ? <Square size={icon - 4} /> : <Mic size={icon} />}
    </button>
  );
  const submit = () => { const v = typed.trim(); if (v && phase === "idle") { setTyped(""); void act(v); } };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite">
        {msgs.length === 0 && phase === "idle" ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-4 text-center">
            {mic("size-24", 36)}
            <p className="max-w-xs text-sm text-muted">{t("chatEmpty")}</p>
            <p className="text-xs text-faint">{t("aTap")}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {msgs.map((m, i) => (
              <div key={i} className={cx("flex", m.me && "justify-end")}>
                <div
                  role={m.me ? undefined : "status"}
                  className={cx("max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-[15px] leading-snug", m.me ? "rounded-br-md bg-accent text-white dark:text-[#101012]" : "rounded-bl-md border border-line bg-sub", m.err && "text-danger")}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {phase !== "idle" && (
              <div className="flex">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-sub px-3.5 py-2 text-[13px] text-muted">
                  <Loader2 size={14} className="animate-spin" /> {phase === "listening" ? t("aListening") : t("aThinking")}
                </div>
              </div>
            )}
            <div ref={end} />
          </div>
        )}
      </div>
      <form className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-3 safe-bottom" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input className={cx(inputCls, "h-11 rounded-full px-4")} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("aType")} aria-label={t("aType")} />
        {typed.trim() ? (
          <button type="submit" disabled={phase !== "idle"} aria-label={t("add")} className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 dark:text-[#101012]"><Send size={17} /></button>
        ) : mic("size-11", 20)}
      </form>
    </div>
  );
}
