import { Copy, Download, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { local, saveSettings, syncClient, uid, useItems, useSettings, useSyncStatus, useT } from "../lib/app";
import { parseTickTickCsv } from "../lib/importTick";
import { type TrackerConfig, TrackerError, clearTracker, getTracker, saveTracker, trackerLogin } from "../lib/tracker";
import { tasksToIcs } from "../lib/ics";
import { isNative } from "../lib/native";
import { getSound, saveSound } from "../lib/pomoNative";
import { widgetPlugin } from "../lib/widget";
import { Button, Field, PageHeader, Segmented, Select, inputCls } from "./ui";
import { AuthPanel } from "./AuthPanel";

interface TokenRow { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number(v) || min));

export function Settings() {
  const t = useT();
  const s = useSettings();
  const status = useSyncStatus();
  const tasks = useItems("task");
  const [msg, setMsg] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const native = typeof (window as any).Capacitor !== "undefined" && (window as any).Capacitor.isNativePlatform?.();
  const [server, setServer] = useState(syncClient.url);

  async function importCsv(f: File) {
    try {
      const rows = parseTickTickCsv(await f.text());
      for (const r of rows) {
        await local.put("task", uid(), {
          title: r.title, notes: r.notes, priority: r.priority, dueDate: r.dueDate, dueTime: r.dueTime,
          done: r.done, completedAt: r.completedAt, repeat: r.repeat, reminders: r.reminders, order: Date.now(),
          subtasks: r.subtasks.map((x) => ({ id: uid(), ...x })),
        });
      }
      setMsg(`${rows.length} ${t("imported")}`);
    } catch (e) {
      setMsg(String((e as Error).message));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("settings")} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-4 pb-16 md:px-6">
          <Section title={t("account")}>
            {syncClient.session ? (
              <>
                <p className="text-[13px]">{t("signedInAs")} <b>{syncClient.session.email}</b> · <span className="text-muted">{status === "idle" ? t("synced") : status === "syncing" ? t("syncing") : status === "offline" ? t("offline") : t("syncError")}</span></p>
                <div className="flex gap-2">
                  <Button onClick={() => void syncClient.syncNow()}>{t("syncNow")}</Button>
                  <Button variant="danger" onClick={() => void syncClient.logout()}>{t("signOut")}</Button>
                </div>
              </>
            ) : <AuthPanel />}
            {native && (
              <Field label={t("serverUrl")}>
                <input className={inputCls} value={server} placeholder="https://dayloop.onrender.com" onChange={(e) => setServer(e.target.value)}
                  onBlur={() => { localStorage.setItem("dl_server", server.replace(/\/+$/, "")); syncClient.setBaseUrl(server); }} />
              </Field>
            )}
          </Section>

          <Section title={t("pomodoro")}>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t("workMin")}><input type="number" className={inputCls} value={s.workMin} onChange={(e) => void saveSettings({ workMin: num(e.target.value, 1, 180) })} /></Field>
              <Field label={t("breakMin")}><input type="number" className={inputCls} value={s.breakMin} onChange={(e) => void saveSettings({ breakMin: num(e.target.value, 1, 60) })} /></Field>
              <Field label={t("longBreakMin")}><input type="number" className={inputCls} value={s.longBreakMin} onChange={(e) => void saveSettings({ longBreakMin: num(e.target.value, 1, 120) })} /></Field>
            </div>
            <Field label={t("longBreakEvery")}><input type="number" className={`${inputCls} w-20`} value={s.longBreakEvery} onChange={(e) => void saveSettings({ longBreakEvery: num(e.target.value, 0, 12) })} /></Field>
            <FocusSound />
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={s.autoStart} onChange={(e) => void saveSettings({ autoStart: e.target.checked })} /> {t("autoStart")}</label>
          </Section>

          <Section title={t("theme")}>
            <Field label={t("language")}><Segmented value={s.language} onChange={(v) => void saveSettings({ language: v })} options={[{ value: "de", label: "Deutsch" }, { value: "en", label: "English" }]} /></Field>
            <Field label={t("theme")}><Segmented value={s.theme} onChange={(v) => void saveSettings({ theme: v })} options={[{ value: "system", label: t("themeSystem") }, { value: "light", label: t("themeLight") }, { value: "dark", label: t("themeDark") }]} /></Field>
            <Field label={t("weekStart")}><Segmented value={s.weekStart} onChange={(v) => void saveSettings({ weekStart: v })} options={[{ value: 1, label: t("monday") }, { value: 0, label: t("sunday") }]} /></Field>
          </Section>

          {native && (
            <Section title={t("widget")}>
              <p className="text-[13px] text-muted">{t("widgetHelp")}</p>
              <Button onClick={() => void widgetPlugin().pinWidget().then((r) => setMsg(r.supported ? "" : t("widgetManual"))).catch(() => setMsg(t("widgetManual")))}>{t("widgetAdd")}</Button>
            </Section>
          )}

          <Section title={t("notifications")}>
            <Field label={t("defaultReminderHour")}><input type="number" min={0} max={23} className={`${inputCls} w-20`} value={s.defaultReminderHour} onChange={(e) => void saveSettings({ defaultReminderHour: num(e.target.value, 0, 23) })} /></Field>
            {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
              <Button onClick={() => void Notification.requestPermission().then(() => setMsg(""))}>{t("enableNotifications")}</Button>
            )}
          </Section>

          <TrackerSection />

          {syncClient.session && <Tokens />}

          <Section title={t("data")}>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => file.current?.click()}><Upload size={14} /> {t("importTick")}</Button>
              <Button onClick={() => download("dayloop.ics", tasksToIcs(tasks), "text/calendar")}><Download size={14} /> {t("exportIcs")}</Button>
              <Button onClick={async () => {
                const dump: Record<string, unknown[]> = {};
                for (const ty of ["task", "habit", "habitlog", "pomodoro", "settings"] as const) dump[ty] = await local.all(ty);
                download("dayloop.json", JSON.stringify(dump, null, 2), "application/json");
              }}><Download size={14} /> {t("exportJson")}</Button>
            </div>
            <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
            {msg && <p role="status" className="text-[13px] text-muted">{msg}</p>}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Tokens() {
  const t = useT();
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [name, setName] = useState("Claude");
  const [fresh, setFresh] = useState("");
  const [copied, setCopied] = useState(false);
  const load = () => syncClient.api<TokenRow[]>("/api/tokens").then(setRows).catch(() => {});
  useEffect(() => void load(), []);
  return (
    <Section title={t("apiTokens")}>
      <p className="text-[13px] text-muted">{t("apiTokensHelp")}</p>
      {fresh && (
        <div className="rounded-ctl border border-accent bg-accent-soft p-3">
          <p className="mb-2 text-xs">{t("tokenCreated")}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs">{fresh}</code>
            <Button onClick={() => { void navigator.clipboard.writeText(fresh); setCopied(true); }}><Copy size={14} /> {copied ? t("copied") : t("copy")}</Button>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tokenName")} />
        <Button onClick={async () => {
          if (!name.trim()) return;
          const r = await syncClient.api<{ token: string }>("/api/tokens", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
          setFresh(r.token); setCopied(false); void load();
        }}>{t("newToken")}</Button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between rounded-ctl border border-line px-3 py-2 text-[13px]">
          <div><b>{r.name}</b> <span className="text-muted">{r.prefix}…</span><div className="text-xs text-muted">{t("lastUsed")}: {r.last_used_at ? new Date(r.last_used_at).toLocaleString() : t("never")}</div></div>
          <Button variant="danger" onClick={async () => { await syncClient.api(`/api/tokens/${r.id}`, { method: "DELETE" }); void load(); }}><Trash2 size={14} /> {t("revoke")}</Button>
        </div>
      ))}
    </Section>
  );
}

function TrackerSection() {
  const t = useT();
  const [cfg, setCfg] = useState<TrackerConfig>(() => getTracker() ?? { url: "", username: "", password: "" });
  const [connected, setConnected] = useState(() => !!getTracker());
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    setMsg("");
    try {
      const c = { ...cfg, url: cfg.url.trim().replace(/\/+$/, "") };
      await trackerLogin(c);
      saveTracker(c);
      setConnected(true);
      setMsg(t("trackerConnected"));
    } catch (e) {
      const code = e instanceof TrackerError ? e.code : "other";
      setMsg(code === "auth" ? t("trackerErrAuth") : code === "network" ? t("trackerErrNet") : t("trackerErr"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title={t("tracker")}>
      <p className="text-[13px] text-muted">{t("trackerHelp")}</p>
      <Field label={t("trackerUrl")}><input className={inputCls} value={cfg.url} placeholder="https://" autoCapitalize="none" onChange={(e) => setCfg({ ...cfg, url: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("trackerUser")}><input className={inputCls} value={cfg.username} autoCapitalize="none" autoComplete="off" onChange={(e) => setCfg({ ...cfg, username: e.target.value })} /></Field>
        <Field label={t("trackerPass")}><input type="password" className={inputCls} value={cfg.password} autoComplete="off" onChange={(e) => setCfg({ ...cfg, password: e.target.value })} /></Field>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" disabled={busy || !cfg.url || !cfg.username || !cfg.password} onClick={() => void connect()}>{t("trackerConnect")}</Button>
        {connected && <Button variant="danger" onClick={() => { clearTracker(); setConnected(false); setCfg({ url: "", username: "", password: "" }); setMsg(""); }}>{t("trackerRemove")}</Button>}
        {msg && <span role="status" className="text-[13px] text-muted">{msg}</span>}
      </div>
    </Section>
  );
}

/** Android: pick the sound that rings when a focus round ends from the sounds installed on the phone. */
function FocusSound() {
  const t = useT();
  const [sounds, setSounds] = useState<{ title: string; uri: string; kind: string }[] | null>(null);
  const [uri, setUri] = useState(getSound()?.uri ?? "");
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    void widgetPlugin().listSounds().then((r) => setSounds(r.sounds)).catch(() => setSounds([]));
    return () => void widgetPlugin().stopSound().catch(() => {});
  }, []);
  // the sound ends by itself: follow the native player so the button flips back
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => void widgetPlugin().soundPlaying().then((r) => { if (!r.playing) setPlaying(false); }).catch(() => setPlaying(false)), 400);
    return () => clearInterval(id);
  }, [playing]);
  if (!isNative() || !sounds) return null;
  const play = (u: string) => { void widgetPlugin().playSound({ uri: u }); setPlaying(true); };
  const toggle = () => {
    if (playing) { void widgetPlugin().stopSound(); setPlaying(false); } else play(uri);
  };
  const pick = (u: string) => {
    setUri(u);
    const s = sounds.find((x) => x.uri === u);
    saveSound(s ? { uri: s.uri, title: s.title } : null);
    play(u);
  };
  return (
    <Field label={t("focusSound")} group>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select label={t("focusSound")} value={uri} onChange={pick} options={[{ value: "", label: t("soundDefault") }, ...sounds.map((x) => ({ value: x.uri, label: x.title }))]} />
        </div>
        <Button onClick={toggle}>{playing ? t("soundStop") : t("soundPreview")}</Button>
      </div>
    </Field>
  );
}
