import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, Download as DownloadIcon, FileUp, Loader2, Music, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLang, useT } from "../lib/app";
import { type Download, type Episode, type MAudio, type MFeed, type MText, SUGGESTED, addAudio, audioBlob, deleteText, downloadEpisode, downloadId, downloadSrc, feedFromUrl, fmtDuration, fmtSize, loadFeed, mdb, removeAudio, removeDownload, saveText, searchPodcasts, subscribe, unsubscribe, useAudios, useFeeds, useTexts } from "../lib/motivation";
import { isNative } from "../lib/native";
import { widgetPlugin } from "../lib/widget";
import { Button, Dialog, Empty, IconButton, PageHeader, Segmented, cx, inputCls } from "./ui";

type Tab = "texts" | "audio" | "podcasts";
interface Playing { src: string; title: string }

/** Own texts and audio files, and podcasts from public RSS feeds. Everything syncs with the account. */
export function Motivation() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("texts");
  const [playing, setPlaying] = useState<Playing | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("motivation")} />
      <div className="flex shrink-0 justify-center border-b border-line px-4 py-2">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[{ value: "texts", label: t("mTexts") }, { value: "audio", label: t("mAudio") }, { value: "podcasts", label: t("mPodcasts") }]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === "texts" && <Texts />}
        {tab === "audio" && <AudioFiles playing={playing} onPlay={setPlaying} />}
        {tab === "podcasts" && <Podcasts onPlay={setPlaying} />}
      </div>
      {playing && <Player p={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}

function Player({ p, onClose }: { p: Playing; onClose: () => void }) {
  return (
    <div className="shrink-0 border-t border-line bg-sub px-4 py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium">{p.title}</span>
        <IconButton label="x" className="size-6" onClick={onClose}><X size={14} /></IconButton>
      </div>
      <audio key={p.src} src={p.src} controls autoPlay className="h-9 w-full" />
    </div>
  );
}

function Texts() {
  const t = useT();
  const texts = useTexts();
  const [edit, setEdit] = useState<MText | null>(null);
  const file = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    for (const f of Array.from(files ?? [])) {
      await saveText({ title: f.name.replace(/\.[^.]+$/, ""), body: await f.text() });
    }
    if (file.current) file.current.value = "";
  }

  return (
    <div>
      <div className="flex gap-2 px-4 py-3 md:px-6">
        <Button variant="primary" onClick={() => setEdit({ title: "", body: "", createdAt: Date.now() })}><Plus size={14} /> {t("mNewText")}</Button>
        <Button onClick={() => file.current?.click()}><FileUp size={14} /> {t("mUploadFile")}</Button>
        <input ref={file} type="file" accept=".txt,.md,text/plain,text/markdown" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </div>
      {texts.length === 0 && <Empty>{t("mNoTexts")}</Empty>}
      {texts.map((x) => (
        <button key={x.id} onClick={() => setEdit(x)} className="block w-full border-b border-line/60 px-4 py-3 text-left md:px-6">
          <div className="truncate text-[15px] font-medium">{x.title || "…"}</div>
          <div className="mt-0.5 line-clamp-2 text-[13px] text-muted">{x.body}</div>
        </button>
      ))}
      {edit && <TextDialog text={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TextDialog({ text, onClose }: { text: MText; onClose: () => void }) {
  const t = useT();
  const fresh = !text.id;
  const [editing, setEditing] = useState(fresh);
  const [title, setTitle] = useState(text.title);
  const [body, setBody] = useState(text.body);
  const [saved, setSaved] = useState(text);
  async function save() {
    if (!title.trim() && !body.trim()) return onClose();
    const row = { ...saved, title: title.trim(), body };
    if (saved.id) { await saveText(row); setSaved(row); setEditing(false); }
    else { await saveText(row); onClose(); }
  }
  if (!editing) {
    return (
      <Dialog title={saved.title || t("mTexts")} titleClass="text-2xl leading-snug" onClose={onClose} wide>
        <article className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap text-[17px] leading-relaxed">{saved.body}</article>
        <div className="mt-4 flex justify-end">
          <IconButton label={t("edit")} onClick={() => setEditing(true)}><Pencil size={17} /></IconButton>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title={fresh ? t("mNewText") : t("edit")} onClose={onClose} wide>
      <div className="space-y-3">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("mTextTitle")} aria-label={t("mTextTitle")} />
        <textarea className={cx(inputCls, "h-64 resize-none py-2 text-[15px] leading-relaxed")} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("mTextBody")} aria-label={t("note")} />
        <div className="flex justify-between">
          {saved.id ? <IconButton label={t("delete")} onClick={async () => { await deleteText(saved.id!); onClose(); }}><Trash2 size={16} /></IconButton> : <span />}
          <div className="flex gap-2">
            <Button onClick={() => (fresh ? onClose() : (setTitle(saved.title), setBody(saved.body), setEditing(false)))}>{t("cancel")}</Button>
            <Button variant="primary" onClick={() => void save()}>{t("save")}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function AudioFiles({ playing, onPlay }: { playing: Playing | null; onPlay: (p: Playing) => void }) {
  const t = useT();
  const audios = useAudios();
  const downloads = useLiveQuery(() => mdb.downloads.orderBy("createdAt").reverse().toArray(), [], []);
  const file = useRef<HTMLInputElement>(null);
  const urls = useRef(new Map<string, string>());
  const [loading, setLoading] = useState<string | null>(null);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function upload(files: FileList | null) {
    for (const f of Array.from(files ?? [])) await addAudio(f);
    if (file.current) file.current.value = "";
  }
  const play = async (a: MAudio) => {
    let u = urls.current.get(a.id);
    if (!u) {
      setLoading(a.id);
      try { u = URL.createObjectURL(await audioBlob(a)); urls.current.set(a.id, u); } catch { setLoading(null); return; }
      setLoading(null);
    }
    onPlay({ src: u, title: a.name });
  };

  return (
    <div>
      <div className="px-4 py-3 md:px-6">
        <Button variant="primary" onClick={() => file.current?.click()}><FileUp size={14} /> {t("mUploadFile")}</Button>
        <input ref={file} type="file" accept="audio/*" multiple hidden onChange={(e) => void upload(e.target.files)} />
      </div>
      {audios.length === 0 && downloads.length === 0 && <Empty>{t("mNoAudio")}</Empty>}
      {downloads.length > 0 && <h2 className="px-4 pb-1 pt-2 text-xs font-medium text-muted md:px-6">{t("mDownloaded")}</h2>}
      {downloads.map((d) => (
        <div key={d.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 md:px-6">
          <button onClick={() => onPlay({ src: downloadSrc(d), title: d.title })} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={d.title}>
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", playing?.title === d.title ? "bg-accent text-white dark:text-[#101012]" : "bg-sub text-muted")}><Play size={15} /></span>
            <span className="min-w-0 flex-1"><span className="line-clamp-2 text-[14px]">{d.title}</span><span className="text-xs text-muted">{d.feed} · {fmtSize(d.size)}</span></span>
          </button>
          <IconButton label={t("delete")} onClick={() => void removeDownload(d)}><Trash2 size={15} /></IconButton>
        </div>
      ))}
      {audios.length > 0 && downloads.length > 0 && <h2 className="px-4 pb-1 pt-3 text-xs font-medium text-muted md:px-6">{t("mOwnAudio")}</h2>}
      {audios.map((a) => (
        <div key={a.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 md:px-6">
          <button onClick={() => void play(a)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label={a.name}>
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", playing?.title === a.name ? "bg-accent text-white dark:text-[#101012]" : "bg-sub text-muted")}>{loading === a.id ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}</span>
            <span className="min-w-0 flex-1 truncate text-[15px]">{a.name}</span>
          </button>
          <IconButton label={t("delete")} onClick={() => void removeAudio(a.id)}><Trash2 size={15} /></IconButton>
        </div>
      ))}
    </div>
  );
}

function Cover({ src, size = 44 }: { src: string; size?: number }) {
  return src
    ? <img src={src} alt="" loading="lazy" className="shrink-0 rounded-lg object-cover" style={{ width: size, height: size }} />
    : <span className="grid shrink-0 place-items-center rounded-lg bg-sub text-muted" style={{ width: size, height: size }}><Music size={size / 2.4} /></span>;
}

function Podcasts({ onPlay }: { onPlay: (p: Playing) => void }) {
  const t = useT();
  const lang = useLang();
  const feeds = useFeeds();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<MFeed[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<MFeed | null>(null);
  const subscribed = new Set(feeds.map((f) => f.url));

  async function search(q: string) {
    if (!q.trim()) return setResults(null);
    setBusy(true);
    try { setResults(/^https?:\/\//i.test(q.trim()) ? [await feedFromUrl(q.trim())] : await searchPodcasts(q.trim(), lang)); } catch { setResults([]); }
    setBusy(false);
  }

  if (open) return <Episodes feed={open} onBack={() => setOpen(null)} onPlay={onPlay} />;

  const Row = ({ f }: { f: MFeed }) => (
    <div className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 md:px-6">
      <button onClick={() => setOpen(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Cover src={f.image} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium">{f.title}</span>
          <span className="block truncate text-xs text-muted">{f.author}</span>
        </span>
      </button>
      {subscribed.has(f.url)
        ? <Button onClick={() => void unsubscribe(f.url)}>{t("mUnsubscribe")}</Button>
        : <Button variant="primary" onClick={() => void subscribe({ url: f.url, title: f.title, image: f.image, author: f.author })}>{t("mSubscribe")}</Button>}
    </div>
  );

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); void search(term); }} className="flex gap-2 px-4 py-3 md:px-6">
        <input className={inputCls} value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t("mSearch")} aria-label={t("mSearch")} />
        <Button type="submit" className="size-9 shrink-0 px-0" aria-label={t("mSearch")}><Search size={16} className={busy ? "animate-pulse" : ""} /></Button>
      </form>
      {results && (results.length === 0 ? <Empty>{t("mNoResults")}</Empty> : results.map((f) => <Row key={f.url} f={f} />))}
      {!results && feeds.length > 0 && (
        <>
          <h2 className="px-4 pb-1 pt-2 text-xs font-medium text-muted md:px-6">{t("mSubscribed")}</h2>
          {feeds.map((f) => <Row key={f.url} f={f} />)}
        </>
      )}
      {!results && (
        <>
          <h2 className="px-4 pb-1 pt-4 text-xs font-medium text-muted md:px-6">{t("mSuggestions")}</h2>
          {SUGGESTED.filter((f) => !subscribed.has(f.url)).map((f) => <Row key={f.url} f={f} />)}
        </>
      )}
    </div>
  );
}

function Episodes({ feed, onBack, onPlay }: { feed: MFeed; onBack: () => void; onPlay: (p: Playing) => void }) {
  const t = useT();
  const lang = useLang();
  const [eps, setEps] = useState<Episode[] | null>(null);
  const [err, setErr] = useState(false);
  const [limit, setLimit] = useState(30);
  const [busy, setBusy] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState("");
  const saved = useLiveQuery(() => mdb.downloads.toArray(), [], []);
  const have = new Map(saved.map((d) => [d.id, d]));
  useEffect(() => {
    let alive = true;
    loadFeed(feed.url).then((f) => alive && setEps(f.episodes)).catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [feed.url]);
  useEffect(() => {
    if (!isNative()) return;
    const h = widgetPlugin().addListener("dlProgress", (d: { name: string; pct: number }) => {
      const id = d.name.replace(/\.[^.]+$/, "");
      setBusy((b) => (id in b ? { ...b, [id]: d.pct } : b));
    });
    return () => void h.then((x) => x.remove());
  }, []);
  const fmt = new Intl.DateTimeFormat(lang, { day: "numeric", month: "short", year: "numeric" });

  async function save(e: Episode) {
    const id = downloadId(e.audio);
    setFailed("");
    setBusy((b) => ({ ...b, [id]: 0 }));
    try { await downloadEpisode(e, feed.title); } catch { setFailed(t("mDlFailed")); }
    setBusy(({ [id]: _, ...rest }) => rest);
  }

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3 md:px-6">
        <IconButton label={t("mBack")} onClick={onBack}><ArrowLeft size={18} /></IconButton>
        <Cover src={feed.image} size={40} />
        <div className="min-w-0 truncate text-[15px] font-semibold">{feed.title}</div>
      </div>
      {failed && <p role="status" className="px-4 pb-2 text-[13px] text-danger md:px-6">{failed}</p>}
      {err && <Empty>{t("mLoadErr")}</Empty>}
      {!err && !eps && <Empty>…</Empty>}
      {eps?.slice(0, limit).map((e, i) => {
        const id = downloadId(e.audio);
        const d = have.get(id);
        const pct = busy[id];
        return (
          <div key={i} className="flex w-full items-center gap-3 border-b border-line/60 px-4 py-3 md:px-6">
            <button onClick={() => onPlay({ src: d ? downloadSrc(d) : e.audio, title: e.title })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sub text-muted"><Play size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[14px]">{e.title}</span>
                <span className="text-xs text-muted">{e.date ? fmt.format(e.date) : ""}{e.duration ? ` · ${fmtDuration(e.duration)}` : ""}</span>
              </span>
            </button>
            {d ? <IconButton label={t("mSaved")} onClick={() => void removeDownload(d)}><Check size={16} className="text-accent" /></IconButton>
              : pct !== undefined ? <span className="grid size-9 shrink-0 place-items-center text-[11px] text-muted tabular-nums">{pct ? `${pct}%` : <Loader2 size={16} className="animate-spin" />}</span>
              : <IconButton label={t("mDownload")} onClick={() => void save(e)}><DownloadIcon size={16} /></IconButton>}
          </div>
        );
      })}
      {eps && eps.length > limit && <div className="p-4 text-center"><Button onClick={() => setLimit(limit + 40)}>{t("mMore")}</Button></div>}
    </div>
  );
}
