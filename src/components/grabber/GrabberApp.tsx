import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  CheckCircle2,
  CircleSlash,
  Copy,
  FileVideo,
  Folder,
  FolderOpen,
  Layers,
  Link2,
  Loader2,
  Linkedin,
  Mail,
  Play,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { Scene3D } from "./Scene3D";
import { ParticleField } from "./ParticleField";
import {
  extractUrls,
  formatBytes,
  getGrabber,
  type DownloadedFile,
  type EngineInfo,
  type Job,
  type Quality,
} from "@/lib/grabber-bridge";
import { cn } from "@/lib/utils";

const QUALITIES: { value: Quality; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p" },
  { value: "480", label: "480p" },
  { value: "audio", label: "Audio" },
];

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "Queued",
  downloading: "Downloading",
  merging: "Merging",
  done: "Completed",
  error: "Failed",
  canceled: "Canceled",
};

let seq = 0;
const nextId = () => `j${Date.now().toString(36)}${(seq++).toString(36)}`;

export function GrabberApp() {
  const api = useMemo(() => getGrabber(), []);
  const [info, setInfo] = useState<EngineInfo>({
    available: false,
    version: null,
    destination: "",
  });
  const [url, setUrl] = useState("");
  const [bulk, setBulk] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [quality, setQuality] = useState<Quality>("best");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [files, setFiles] = useState<DownloadedFile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refreshFiles = useCallback(() => {
    api.listFiles().then(setFiles).catch(() => undefined);
  }, [api]);

  useEffect(() => {
    api.getInfo().then(setInfo).catch(() => undefined);
    refreshFiles();
    return api.onProgress((e) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === e.id
            ? {
                ...j,
                status: e.status,
                progress: e.progress ?? j.progress,
                speed: e.speed ?? (e.status === "done" ? "" : j.speed),
                eta: e.eta ?? (e.status === "done" ? "" : j.eta),
                size: e.size ?? j.size,
                title: e.title ?? j.title,
                filePath: e.filePath ?? j.filePath,
                error: e.error,
              }
            : j,
        ),
      );
      if (e.status === "done") refreshFiles();
    });
  }, [api, refreshFiles]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const addUrls = (list: string[]) => {
    if (!list.length) {
      setNotice("No valid links found.");
      return;
    }
    setJobs((prev) => {
      const existing = new Set(prev.map((j) => j.url));
      const fresh = list
        .filter((u) => !existing.has(u))
        .map<Job>((u) => ({
          id: nextId(),
          url: u,
          title: u,
          status: "queued",
          progress: 0,
          speed: "",
          eta: "",
          size: "",
        }));
      if (!fresh.length) setNotice("Those links are already in the queue.");
      else setNotice(`${fresh.length} link${fresh.length > 1 ? "s" : ""} added to the queue.`);
      return [...prev, ...fresh];
    });
  };

  const startJob = (job: Job) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, status: "downloading", progress: 0, error: undefined } : j)),
    );
    api.start({ id: job.id, url: job.url, quality });
  };

  const startAll = () => {
    const pending = jobs.filter((j) => j.status === "queued" || j.status === "error" || j.status === "canceled");
    if (!pending.length) {
      setNotice("Nothing pending in the queue.");
      return;
    }
    pending.forEach(startJob);
  };

  const active = jobs.filter((j) => j.status === "downloading" || j.status === "merging").length;
  const completed = jobs.filter((j) => j.status === "done").length;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background font-sans">
      {/* ambient background */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full opacity-20 blur-[120px]"
        style={{ background: "var(--gradient-violet)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-52 right-0 h-[380px] w-[380px] rounded-full opacity-15 blur-[130px]"
        style={{ background: "var(--gradient-violet)" }}
      />
      <ParticleField />

      <TitleBar desktop={api.isDesktop} />

      <main className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1.35fr_1fr] lg:overflow-hidden">
        {/* left column */}
        <section className="flex min-h-0 flex-col gap-4">
          {/* capture panel */}
          <div className="panel animate-rise rounded-2xl p-5">
            <div className="flex items-start gap-5">
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-2xl font-semibold tracking-tight">
                  Paste a link. <span className="text-gradient">Grab the video.</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Works with 1000+ sites through the yt-dlp engine — single links or bulk lists.
                </p>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          addUrls(extractUrls(url));
                          setUrl("");
                        }
                      }}
                      placeholder="https://…"
                      spellCheck={false}
                      className="h-11 w-full rounded-xl border border-input bg-surface/70 pl-9 pr-3 font-mono text-sm text-foreground outline-none transition-all duration-300 placeholder:text-muted-foreground/70 focus:border-primary/60 focus:bg-surface focus:shadow-[0_0_0_4px_oklch(0.63_0.208_296/14%)]"
                    />
                  </div>
                  <button
                    onClick={() => {
                      addUrls(extractUrls(url));
                      setUrl("");
                    }}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium text-primary-foreground transition-transform duration-300 hover:-translate-y-0.5 active:translate-y-0"
                    style={{ backgroundImage: "var(--gradient-violet)", boxShadow: "var(--shadow-glow)" }}
                  >
                    <ArrowDownToLine className="h-4 w-4" />
                    Add
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {QUALITIES.map((q) => (
                    <button
                      key={q.value}
                      onClick={() => setQuality(q.value)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                        quality === q.value
                          ? "border-primary/60 bg-primary/15 text-primary-glow"
                          : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setBulkOpen((v) => !v)}
                    className={cn(
                      "ml-auto inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                      bulkOpen
                        ? "border-primary/60 bg-primary/15 text-primary-glow"
                        : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Bulk
                  </button>
                </div>
              </div>

              <Scene3D />
            </div>

            {bulkOpen && (
              <div className="animate-rise mt-4 rounded-xl border border-border bg-surface/50 p-3">
                <textarea
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  rows={5}
                  spellCheck={false}
                  placeholder={"One URL per line…\nhttps://…\nhttps://…"}
                  className="w-full resize-none bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      addUrls(extractUrls(bulk));
                      setBulk("");
                    }}
                    className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary-glow transition-colors hover:bg-primary/30"
                  >
                    Queue {extractUrls(bulk).length || ""} links
                  </button>
                  <button
                    onClick={() => fileInput.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Import .txt / .csv
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept=".txt,.csv,text/plain"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setBulk(await f.text());
                      e.target.value = "";
                    }}
                  />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {extractUrls(bulk).length} valid
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* queue */}
          <div className="panel flex min-h-0 flex-1 flex-col rounded-2xl">
            <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold tracking-wide uppercase">Queue</h2>
              <span className="rounded-md bg-surface-raised px-2 py-0.5 text-xs text-muted-foreground">
                {jobs.length}
              </span>
              {active > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-primary-glow">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {active} active
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={startAll}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary-glow transition-colors hover:bg-primary/30"
                >
                  <Play className="h-3.5 w-3.5" />
                  Download all
                </button>
                <button
                  onClick={() => setJobs((p) => p.filter((j) => j.status !== "done"))}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Clear done
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {jobs.length === 0 ? (
                <Empty
                  icon={<Link2 className="h-5 w-5" />}
                  title="Queue is empty"
                  hint="Add a link above, or paste a whole list with Bulk."
                />
              ) : (
                <ul className="space-y-2">
                  {jobs.map((job) => (
                    <JobRow
                      key={job.id}
                      job={job}
                      onStart={() => startJob(job)}
                      onCancel={() => api.cancel(job.id)}
                      onRemove={() => setJobs((p) => p.filter((j) => j.id !== job.id))}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* right column */}
        <aside className="flex min-h-0 flex-col gap-4">
          <DestinationCard
            info={info}
            onBrowse={async () => {
              const dir = await api.chooseDestination();
              if (dir) {
                setInfo((i) => ({ ...i, destination: dir }));
                refreshFiles();
                setNotice("Download folder updated.");
              } else if (!api.isDesktop) {
                setNotice("Folder picking is available in the desktop app.");
              }
            }}
            onOpen={() => api.openPath(info.destination)}
            desktop={api.isDesktop}
            completed={completed}
          />

          <div className="panel flex min-h-0 flex-1 flex-col rounded-2xl">
            <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide">Downloads</h2>
              <span className="rounded-md bg-surface-raised px-2 py-0.5 text-xs text-muted-foreground">
                {files.length}
              </span>
              <button
                onClick={refreshFiles}
                className="ml-auto rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Refresh file list"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {files.length === 0 ? (
                <Empty
                  icon={<FileVideo className="h-5 w-5" />}
                  title="No files yet"
                  hint="Finished downloads land here, ready to open."
                />
              ) : (
                <ul className="space-y-2">
                  {files.map((f) => (
                    <li
                      key={f.path}
                      className="animate-rise group flex items-center gap-3 rounded-xl border border-border bg-surface/50 px-3 py-2.5 transition-colors hover:border-primary/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary-glow">
                        <FileVideo className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{f.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatBytes(f.size)} · {new Date(f.modified).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <IconBtn label="Play file" onClick={() => api.openPath(f.path)}>
                          <Play className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Show in folder" onClick={() => api.revealPath(f.path)}>
                          <FolderOpen className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>
      </main>

      <StatusBar info={info} desktop={api.isDesktop} active={active} completed={completed} />

      {notice && (
        <div className="animate-rise pointer-events-none fixed bottom-14 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-primary/35 bg-popover/95 px-4 py-2 text-sm text-foreground shadow-[var(--shadow-glow)]">
          {notice}
        </div>
      )}
    </div>
  );
}

function TitleBar({ desktop }: { desktop: boolean }) {
  return (
    <header className="drag-region relative z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg font-display text-sm font-bold text-primary-foreground"
        style={{ backgroundImage: "var(--gradient-violet)" }}
      >
        G
      </div>
      <div className="leading-none">
        <p className="font-display text-base font-semibold tracking-[0.18em]">GRABBER</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Video downloader
        </p>
      </div>
      <div className="no-drag ml-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden sm:inline">by Sourav</span>
        <a
          href="https://www.linkedin.com/in/sourav-mondal-a28576404"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Linkedin className="h-3.5 w-3.5" />
          <span className="hidden md:inline">LinkedIn</span>
        </a>
        <a
          href="mailto:velocitymetamite@gmail.com"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <Mail className="h-3.5 w-3.5" />
          <span className="hidden md:inline">velocitymetamite@gmail.com</span>
        </a>
        {!desktop && (
          <span className="rounded-md bg-surface-raised px-2 py-1 text-[10px] uppercase tracking-wider">
            Preview
          </span>
        )}
      </div>
    </header>
  );
}

function JobRow({
  job,
  onStart,
  onCancel,
  onRemove,
}: {
  job: Job;
  onStart: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const running = job.status === "downloading" || job.status === "merging";
  const looksLikeHomepage = useMemo(() => {
    try {
      const u = new URL(job.url);
      const hasPath = u.pathname.replace(/\/+$/, "").length > 0;
      const meaningfulQuery = Array.from(u.searchParams.keys()).some(
        (k) => !/^(utm_|msg$|ref$|fbclid$|gclid$)/i.test(k),
      );
      return !hasPath && !meaningfulQuery;
    } catch {
      return false;
    }
  }, [job.url]);

  return (
    <li className="animate-rise rounded-xl border border-border bg-surface/50 p-3 transition-colors hover:border-primary/35">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            job.status === "done" && "bg-success/15 text-success",
            job.status === "error" && "bg-destructive/15 text-destructive",
            running && "bg-primary/15 text-primary-glow",
            (job.status === "queued" || job.status === "canceled") && "bg-surface-raised text-muted-foreground",
          )}
        >
          {job.status === "done" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : job.status === "error" ? (
            <CircleSlash className="h-4 w-4" />
          ) : running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{job.title}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{job.url}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!running && job.status !== "done" && (
            <IconBtn label="Download this" onClick={onStart}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
            </IconBtn>
          )}
          {running && (
            <IconBtn label="Cancel" onClick={onCancel}>
              <X className="h-3.5 w-3.5" />
            </IconBtn>
          )}
          <IconBtn label="Remove" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
          <div
            className={cn("h-full rounded-full transition-[width] duration-300 ease-out", running && "sheen")}
            style={{
              width: `${job.progress}%`,
              backgroundImage:
                job.status === "error" ? "none" : "var(--gradient-violet)",
              backgroundColor: job.status === "error" ? "var(--destructive)" : undefined,
            }}
          />
        </div>
        <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
          {Math.round(job.progress)}%
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className={cn(job.status === "error" && "text-destructive")}>
          {job.error ? job.error : STATUS_LABEL[job.status]}
        </span>
        {job.status === "error" && job.error && (
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(`${job.url}\n${job.error}`)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Copy className="h-3 w-3" /> Copy error
          </button>
        )}
        {job.speed && <span>{job.speed}</span>}
        {job.eta && <span>ETA {job.eta}</span>}
        {job.size && <span>{job.size}</span>}
      </div>
      {looksLikeHomepage && job.status !== "done" && (
        <p className="mt-1 text-[11px] text-primary-glow">
          Looks like a homepage, not a video link.
        </p>

      )}

    </li>
  );
}

function DestinationCard({
  info,
  onBrowse,
  onOpen,
  desktop,
  completed,
}: {
  info: EngineInfo;
  onBrowse: () => void;
  onOpen: () => void;
  desktop: boolean;
  completed: number;
}) {
  return (
    <div className="panel animate-rise rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <Folder className="h-3.5 w-3.5" />
        Destination
      </div>
      <p className="mt-2 truncate font-mono text-sm text-foreground" title={info.destination}>
        {info.destination || "…"}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onBrowse}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/20 px-3 py-2 text-xs font-medium text-primary-glow transition-colors hover:bg-primary/30"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Change folder
        </button>
        {desktop && (
          <button
            onClick={onOpen}
            className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Open
          </button>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Stat label="Completed" value={String(completed)} />
        <Stat label="Engine" value={info.available ? `yt-dlp ${info.version ?? ""}` : desktop ? "Not found" : "Simulated"} />
      </div>
      {desktop && !info.available && (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] leading-relaxed text-destructive">
          yt-dlp was not found on this PC. Install it and restart Grabber —
          <span className="font-mono"> winget install yt-dlp</span> or
          <span className="font-mono"> pip install -U yt-dlp</span>.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm text-foreground">{value}</p>
    </div>
  );
}

function StatusBar({
  info,
  desktop,
  active,
  completed,
}: {
  info: EngineInfo;
  desktop: boolean;
  active: number;
  completed: number;
}) {
  return (
    <footer className="relative z-10 flex h-9 shrink-0 items-center gap-4 border-t border-border px-5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            info.available ? "bg-success" : desktop ? "bg-destructive" : "bg-primary",
          )}
        />
        {info.available ? "Engine ready" : desktop ? "Engine missing" : "Preview mode"}
      </span>
      <span>{active} active</span>
      <span>{completed} completed</span>
      <span className="ml-auto flex items-center gap-2">
        Grabber · Sourav ·
        <a
          href="https://www.linkedin.com/in/sourav-mondal-a28576404"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-primary-glow"
        >
          LinkedIn
        </a>
        ·
        <a
          href="mailto:velocitymetamite@gmail.com"
          className="transition-colors hover:text-primary-glow"
        >
          velocitymetamite@gmail.com
        </a>
      </span>
    </footer>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg border border-border p-1.5 text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary-glow"
    >
      {children}
    </button>
  );
}

function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface/50 text-muted-foreground">
        {icon}
      </span>
      <p className="text-sm text-foreground">{title}</p>
      <p className="max-w-56 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
