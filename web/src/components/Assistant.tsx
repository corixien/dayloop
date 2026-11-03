import { Loader2, Mic, Send, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantError, getGroqKey, runAssistant, transcribe } from "../lib/assistant";
import { appTools } from "../lib/assistantTools";
import { useLang, useSettings, useT } from "../lib/app";
import { pomo } from "../lib/pomoStore";
import { Button, inputCls } from "./ui";

type Phase = "idle" | "listening" | "thinking";

/** Record until the user stops talking (or taps), then transcribe and act. Text input as a fallback. */
export function AssistantPanel({ autoStart }: { autoStart?: boolean }) {
  const t = useT();
  const lang = useLang();
  const settings = useSettings();
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState<{ text: string; err?: boolean } | null>(null);
  const [typed, setTyped] = useState("");
  const rec = useRef<{ stop: () => void } | null>(null);
  const key = getGroqKey();
  useEffect(() => pomo.init(settings), [settings.workMin, settings.breakMin, settings.longBreakMin, settings.longBreakEvery, settings.autoStart]);

  const errText = (e: unknown) => (e instanceof AssistantError ? `${t(`aErr_${e.code}` as "aErr_auth")}${e.detail ? `\n${e.detail}` : ""}` : t("aError"));

  const act = useCallback(async (text: string) => {
    setHeard(text);
    if (!text) return setAnswer({ text: t("aNothingHeard"), err: true });
    setPhase("thinking");
    try {
      const r = await runAssistant(text, appTools, key, { lang });
      setAnswer({ text: r.text || (r.actions.length ? t("aDone") : t("aError")) });
    } catch (e) {
      setAnswer({ text: errText(e), err: true });
    }
    setPhase("idle");
  }, [key, lang, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const listen = useCallback(async () => {
    if (phase !== "idle") return;
    setAnswer(null); setHeard("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setAnswer({ text: t("aMicDenied"), err: true });
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
      if ((!spoke && vad) || total < 2000) { setPhase("idle"); return setAnswer({ text: t("aNothingHeard"), err: true }); }
      setPhase("thinking");
      try {
        await act(await transcribe(new Blob(chunks, { type: mr.mimeType }), key, lang));
      } catch (e) {
        setAnswer({ text: errText(e), err: true });
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

  return (
    <div className="flex flex-col items-center gap-4 px-5 pb-6 pt-2">
      <button
        onClick={() => (phase === "listening" ? rec.current?.stop() : void listen())}
        disabled={phase === "thinking"}
        aria-label={t("aMic")}
        className={`grid size-24 place-items-center rounded-full text-white transition-transform active:scale-95 dark:text-[#101012] ${phase === "listening" ? "animate-pulse bg-danger" : "bg-accent"}`}
      >
        {phase === "thinking" ? <Loader2 size={34} className="animate-spin" /> : phase === "listening" ? <Square size={30} /> : <Mic size={36} />}
      </button>
      <div className="text-xs text-muted">{phase === "listening" ? t("aListening") : phase === "thinking" ? t("aThinking") : t("aTap")}</div>
      {heard && <div className="max-w-full text-center text-sm italic text-muted">„{heard}“</div>}
      {answer && <div role="status" className={`max-w-full whitespace-pre-line text-center text-[15px] ${answer.err ? "text-danger" : ""}`}>{answer.text}</div>}
      <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); const v = typed.trim(); if (v && phase === "idle") { setTyped(""); setAnswer(null); void act(v); } }}>
        <input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("aType")} aria-label={t("aType")} />
        <Button type="submit" className="size-9 shrink-0 px-0" aria-label={t("add")}><Send size={15} /></Button>
      </form>
    </div>
  );
}
