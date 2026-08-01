## What's happening

`https://www.apnacollege.in/?msg=not-logged-in` is a regular website page (a login-redirected homepage), not a video page. yt-dlp has no site-specific extractor for it, so it exits with `ERROR: Unsupported URL:` and Grabber surfaces that raw message in the queue row. This is yt-dlp behaving correctly — but Grabber should try harder and explain better instead of dead-ending.

## Fix

**1. Automatic generic-extractor retry (electron/main.cjs)**
When yt-dlp exits non-zero and stderr contains `Unsupported URL`, re-run the same job once with `--force-generic-extractor` (plus `--no-warnings`). Many pages embed a direct `.mp4`/HLS stream that the generic extractor can pull even without a dedicated site plugin. Progress events keep flowing under the same job id, so the UI shows one continuous attempt.

**2. Human-readable failure messages**
Map common yt-dlp stderr patterns to plain guidance before sending them to the UI:
- `Unsupported URL` (after the retry also fails) → "No video found on this page. Open the video itself and copy that link — homepages and login pages have nothing to download."
- login / `--cookies` / `Private video` / `members-only` → "This video needs a login. Grabber can't sign in for you."
- `HTTP Error 404` / `Video unavailable` → "Video not available at this link."
- Anything else → keep the last stderr line as today.

**3. Client-side URL sanity check (GrabberApp.tsx)**
Before queuing, flag URLs with no path and no query beyond tracking params (i.e. bare domains / homepages) with an inline warning on the row: "Looks like a homepage, not a video link." The job can still be run — it's a hint, not a block.

**4. Error row affordance**
The failed row's message gets a "Copy error" affordance and keeps the existing retry button, so a real extractor failure is reportable.

## Technical notes

- Retry logic lives in the existing `ipcMain.handle("grabber:start")` close handler: extract the spawn into a local `run(extraArgs)` helper so the retry reuses arg construction, progress parsing, and the destination path.
- Error mapping goes in a small `friendlyError(stderr)` function in `electron/main.cjs`; the simulator in `src/lib/grabber-bridge.ts` is unaffected since it never errors.
- No UI layout changes beyond the warning text and copy button inside the existing job row.
