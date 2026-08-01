/**
 * Bridge between the Grabber UI and the desktop (Electron) engine.
 * In the browser preview there is no engine, so a faithful simulator is used
 * with the exact same API surface.
 */

export type JobStatus =
  | "queued"
  | "downloading"
  | "merging"
  | "done"
  | "error"
  | "canceled";

export interface Job {
  id: string;
  url: string;
  title: string;
  status: JobStatus;
  progress: number;
  speed: string;
  eta: string;
  size: string;
  filePath?: string;
  error?: string;
}

export interface DownloadedFile {
  name: string;
  path: string;
  size: number;
  modified: number;
}

export interface EngineInfo {
  available: boolean;
  version: string | null;
  destination: string;
}

export interface ProgressEvent {
  id: string;
  status: JobStatus;
  progress?: number;
  speed?: string;
  eta?: string;
  size?: string;
  title?: string;
  filePath?: string;
  error?: string;
}

export type Quality = "best" | "1080" | "720" | "480" | "audio";

export interface GrabberApi {
  isDesktop: boolean;
  getInfo(): Promise<EngineInfo>;
  chooseDestination(): Promise<string | null>;
  setDestination(path: string): Promise<string>;
  start(job: { id: string; url: string; quality: Quality }): Promise<void>;
  cancel(id: string): Promise<void>;
  listFiles(): Promise<DownloadedFile[]>;
  openPath(path: string): Promise<void>;
  revealPath(path: string): Promise<void>;
  readTextFile(): Promise<string | null>;
  onProgress(cb: (e: ProgressEvent) => void): () => void;
}

declare global {
  interface Window {
    grabber?: Omit<GrabberApi, "isDesktop">;
  }
}

/* ----------------------------- simulator ------------------------------ */

function niceTitle(url: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() ?? u.hostname;
    return decodeURIComponent(last).replace(/[-_]+/g, " ").slice(0, 64) || u.hostname;
  } catch {
    return url.slice(0, 64);
  }
}

function createSimulator(): GrabberApi {
  const listeners = new Set<(e: ProgressEvent) => void>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const files: DownloadedFile[] = [];
  let destination = "~/Videos/Grabber";

  const emit = (e: ProgressEvent) => listeners.forEach((l) => l(e));

  return {
    isDesktop: false,
    async getInfo() {
      return { available: false, version: null, destination };
    },
    async chooseDestination() {
      return null;
    },
    async setDestination(p: string) {
      destination = p;
      return destination;
    },
    async start({ id, url, quality }) {
      const title = niceTitle(url);
      const totalMb = 40 + Math.random() * 320;
      let progress = 0;
      emit({ id, status: "downloading", progress: 0, title });
      const timer = setInterval(() => {
        progress = Math.min(100, progress + 1.4 + Math.random() * 4);
        const speed = `${(2 + Math.random() * 9).toFixed(1)} MB/s`;
        const eta = `${Math.max(0, Math.round(((100 - progress) / 100) * 42))}s`;
        if (progress >= 100) {
          clearInterval(timer);
          timers.delete(id);
          const name = `${title}${quality === "audio" ? ".m4a" : ".mp4"}`;
          const file = {
            name,
            path: `${destination}/${name}`,
            size: Math.round(totalMb * 1024 * 1024),
            modified: Date.now(),
          };
          files.unshift(file);
          emit({ id, status: "done", progress: 100, filePath: file.path, size: `${totalMb.toFixed(1)} MB` });
        } else {
          emit({
            id,
            status: "downloading",
            progress,
            speed,
            eta,
            size: `${totalMb.toFixed(1)} MB`,
          });
        }
      }, 260);
      timers.set(id, timer);
    },
    async cancel(id) {
      const t = timers.get(id);
      if (t) clearInterval(t);
      timers.delete(id);
      emit({ id, status: "canceled" });
    },
    async listFiles() {
      return [...files];
    },
    async openPath() {},
    async revealPath() {},
    async readTextFile() {
      return null;
    },
    onProgress(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

let cached: GrabberApi | null = null;

export function getGrabber(): GrabberApi {
  if (cached) return cached;
  if (typeof window !== "undefined" && window.grabber) {
    cached = { isDesktop: true, ...window.grabber };
  } else {
    cached = createSimulator();
  }
  return cached;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function extractUrls(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\/\S+$/i.test(s)),
    ),
  );
}
