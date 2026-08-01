const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execFile } = require("child_process");

const SETTINGS_FILE = () => path.join(app.getPath("userData"), "grabber-settings.json");
const VIDEO_EXT = [".mp4", ".mkv", ".webm", ".mov", ".m4a", ".mp3", ".flv", ".avi", ".opus"];

let win = null;
const procs = new Map();

function defaultDestination() {
  try {
    return path.join(app.getPath("videos"), "Grabber");
  } catch {
    return path.join(os.homedir(), "Grabber");
  }
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8"));
  } catch {
    return { destination: defaultDestination() };
  }
}

function writeSettings(s) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s, null, 2));
  } catch (e) {
    console.error("settings write failed", e);
  }
}

/** Prefer a bundled binary in resources, otherwise fall back to PATH. */
function ytdlpCandidates() {
  const bin = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return [path.join(process.resourcesPath || "", "bin", bin), bin];
}

function detectEngine() {
  return new Promise((resolve) => {
    const list = ytdlpCandidates();
    const tryNext = (i) => {
      if (i >= list.length) return resolve({ available: false, version: null, path: null });
      execFile(list[i], ["--version"], { timeout: 8000 }, (err, stdout) => {
        if (err) return tryNext(i + 1);
        resolve({ available: true, version: String(stdout).trim(), path: list[i] });
      });
    };
    tryNext(0);
  });
}

function formatSelector(quality) {
  switch (quality) {
    case "audio":
      return ["-f", "bestaudio/best", "-x", "--audio-format", "m4a"];
    case "1080":
    case "720":
    case "480":
      return ["-f", `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`, "--merge-output-format", "mp4"];
    default:
      return ["-f", "bestvideo+bestaudio/best", "--merge-output-format", "mp4"];
  }
}

function friendlyError(stderr, code) {
  const text = String(stderr || "");
  if (/Unsupported URL/i.test(text))
    return "No video found on this page. Open the video itself and copy that link — homepages and login pages have nothing to download.";
  if (/--cookies|login|Private video|members-only|Sign in to confirm|age.?restricted/i.test(text))
    return "This video needs a login. Grabber can't sign in for you.";
  if (/HTTP Error 404|Video unavailable|This video is not available|HTTP Error 410/i.test(text))
    return "Video not available at this link.";
  if (/HTTP Error 403|Forbidden/i.test(text))
    return "The site refused the download (403). The link may be region-locked or expired.";
  if (/getaddrinfo|ENOTFOUND|Temporary failure in name resolution|Network is unreachable/i.test(text))
    return "Network error — check your internet connection.";
  const last = text.split("\n").map((l) => l.trim()).filter(Boolean).pop();
  return (last || `yt-dlp exited with code ${code}`).slice(0, 240);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}


// Explicitly keep GPU compositing/rasterization on so canvas animations
// (the ambient particle field) run smoothly in the packaged app.
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disable-frame-rate-limit");
app.commandLine.appendSwitch("enable-features", "CanvasOopRasterization");

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#00000000",
      symbolColor: "#ffffff"
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      offscreen: false,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "..", "dist-desktop", "index.desktop.html"));
}

app.whenReady().then(() => {
  const settings = readSettings();
  fs.mkdirSync(settings.destination, { recursive: true });

  ipcMain.handle("grabber:info", async () => {
    const engine = await detectEngine();
    return {
      available: engine.available,
      version: engine.version,
      destination: readSettings().destination,
    };
  });

  ipcMain.handle("grabber:chooseDestination", async () => {
    const res = await dialog.showOpenDialog(win, {
      title: "Choose download folder",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: readSettings().destination,
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const s = { ...readSettings(), destination: res.filePaths[0] };
    writeSettings(s);
    return s.destination;
  });

  ipcMain.handle("grabber:setDestination", async (_e, dir) => {
    const s = { ...readSettings(), destination: dir };
    fs.mkdirSync(dir, { recursive: true });
    writeSettings(s);
    return s.destination;
  });

  ipcMain.handle("grabber:start", async (_e, { id, url, quality }) => {
    const engine = await detectEngine();
    if (!engine.available) {
      send("grabber:progress", {
        id,
        status: "error",
        error: "yt-dlp not found. Install it and restart Grabber.",
      });
      return;
    }
    const dest = readSettings().destination;
    fs.mkdirSync(dest, { recursive: true });

    let lastFile = null;

    const onLine = (line) => {
      const dl = line.match(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/);
      if (dl) {
        send("grabber:progress", {
          id,
          status: "downloading",
          progress: parseFloat(dl[1]),
          size: dl[2],
          speed: dl[3] && dl[3] !== "Unknown" ? dl[3] : "",
          eta: dl[4] && dl[4] !== "Unknown" ? dl[4] : "",
        });
        return;
      }
      const title = line.match(/\[download\] Destination: (.+)/);
      if (title) {
        lastFile = title[1].trim();
        send("grabber:progress", { id, status: "downloading", title: path.basename(lastFile) });
      }
      const merge = line.match(/\[Merger\] Merging formats into "(.+)"/);
      if (merge) {
        lastFile = merge[1];
        send("grabber:progress", { id, status: "merging", progress: 99, title: path.basename(lastFile) });
      }
      const done = line.match(/\[download\] (.+) has already been downloaded/);
      if (done) lastFile = done[1].trim();
    };

    const run = (extraArgs) =>
      new Promise((resolve) => {
        const args = [
          ...formatSelector(quality),
          ...extraArgs,
          "--newline",
          "--no-playlist",
          "--restrict-filenames",
          "-o",
          path.join(dest, "%(title).150s.%(ext)s"),
          url,
        ];

        const child = spawn(engine.path, args, { windowsHide: true });
        procs.set(id, child);

        let buf = "";
        child.stdout.on("data", (d) => {
          buf += d.toString();
          const lines = buf.split(/\r?\n|\r/);
          buf = lines.pop() ?? "";
          lines.forEach(onLine);
        });

        let errText = "";
        child.stderr.on("data", (d) => {
          errText += d.toString();
        });

        child.on("error", (e) => {
          procs.delete(id);
          resolve({ code: -1, signal: null, errText: e.message });
        });

        child.on("close", (code, signal) => {
          procs.delete(id);
          resolve({ code, signal, errText });
        });
      });

    send("grabber:progress", { id, status: "downloading", progress: 0 });

    let result = await run([]);

    // Some pages have no dedicated extractor but still embed a playable stream.
    if (result.code !== 0 && !result.signal && /Unsupported URL/i.test(result.errText)) {
      send("grabber:progress", { id, status: "downloading", progress: 0 });
      const retry = await run(["--force-generic-extractor", "--no-warnings"]);
      // Keep the original message if the fallback fails with the same class of error.
      result = retry.code === 0 ? retry : { ...retry, errText: retry.errText || result.errText };
    }

    if (result.signal) return send("grabber:progress", { id, status: "canceled" });

    if (result.code === 0) {
      send("grabber:progress", {
        id,
        status: "done",
        progress: 100,
        filePath: lastFile || dest,
        title: lastFile ? path.basename(lastFile) : undefined,
      });
    } else {
      send("grabber:progress", {
        id,
        status: "error",
        error: friendlyError(result.errText, result.code),
      });
    }
  });


  ipcMain.handle("grabber:cancel", async (_e, id) => {
    const child = procs.get(id);
    if (child) {
      child.kill("SIGTERM");
      procs.delete(id);
    }
    send("grabber:progress", { id, status: "canceled" });
  });

  ipcMain.handle("grabber:listFiles", async () => {
    const dest = readSettings().destination;
    try {
      return fs
        .readdirSync(dest)
        .filter((n) => VIDEO_EXT.includes(path.extname(n).toLowerCase()))
        .map((n) => {
          const full = path.join(dest, n);
          const st = fs.statSync(full);
          return { name: n, path: full, size: st.size, modified: st.mtimeMs };
        })
        .sort((a, b) => b.modified - a.modified);
    } catch {
      return [];
    }
  });

  ipcMain.handle("grabber:openPath", async (_e, p) => {
    await shell.openPath(p);
  });

  ipcMain.handle("grabber:revealPath", async (_e, p) => {
    shell.showItemInFolder(p);
  });

  ipcMain.handle("grabber:readTextFile", async () => {
    const res = await dialog.showOpenDialog(win, {
      title: "Import URL list",
      filters: [{ name: "Text", extensions: ["txt", "csv"] }],
      properties: ["openFile"],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return fs.readFileSync(res.filePaths[0], "utf8");
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  procs.forEach((c) => c.kill("SIGTERM"));
  if (process.platform !== "darwin") app.quit();
});
