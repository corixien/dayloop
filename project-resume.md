# Dayloop: project resume

## What
One todo list with deadlines (calendar), Have Done list (by day, sendable to the Productivity-Tracker), habits, pomodoro (25/5). Web PWA + Android (Capacitor), offline-first, Express + Neon + Render (`https://dayloop.onrender.com`); Claude access through Website-MCP (`dayloop_*`). Public repo corixien/dayloop, folder ~/dayloop. See AGENTS.md for product rules/invariants, README for commands.

## Layout
`shared/` zod schemas | `server/` API, sync, auth, tests (PGlite) | `web/` React app, `web/src/lib` (db, sync, logic), `web/android` | `e2e/` Playwright | `docs/mcp.md`.

## Current state
- Done: server + sync, simplified web app (Todo, Have Done, calendar, habits, pomodoro, settings incl. tracker + API tokens), custom dropdown, drag-following drawer/sheet/row swipes, Android build with new launcher icon, Website-MCP tools (committed and pushed), Render deploy live. Tests: server 13, web 31, Playwright e2e (desktop + mobile touch, fake tracker), MCP 37.
- Phone: production APK installed, user is signed in and the Zahnarzt todo is synced. Widget (todo/have done, checkboxes, plus, settings, overlay sheets) is built and installed; not yet seen on the home screen (user adds it via Settings > Widget hinzufügen or the widget picker).
- Open: widget check on the device, MCP check from a new Claude session (Horizon runs the new tools, this session had a stale tool list), live check against the real tracker (needs the user's tracker URL/account), release signing, date/time pickers are still native.
- Local server for tests: `cd server && PORT=3100 PGLITE_DIR=/tmp/dl-e2e-pg npx tsx src/dev.ts`; debug build against it: `CAP_DEBUG=1 VITE_API_URL=http://localhost:3100`, `adb reverse tcp:3100 tcp:3100`.

## Update 2026-10-31
- Overlay: WebView hidden until `overlayReady()`, lighter backdrop (black/20), sheet 78dvh. Notes are checklist editor (`- ` becomes round checkbox, subtasks migrated into notes). Icons for note/checklist in TaskRow and widget rows. APK built (debug), not installed (phone offline), not tested on device.
- e2e: port 3100 is taken by matnotes; run `PORT=3190 npm run dev:local -w server` and `E2E_URL=http://localhost:3190 npx playwright test`.

- 2026-10-31 later: notes checklist w/ timestamps, calendar color coding + pinch + prev/next, per-entry tracker send (web + widget), FAB right, bigger headings, habits one-line rows, widget footer tap opens app. APK installed on phone, not device-tested.

- 2026-11-01: calendar zoom/habits/completion times, notes autosave, focus custom time + zen + native live notification + sounds, MCP full control, release signing (~/.dayloop-release), GitHub release v1.0.0. Phone: user may need to log in again (Settings > Account) if the session was lost.
