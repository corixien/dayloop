# Dayloop: project resume

## What
TickTick-style tasks, habits, calendar, pomodoro (25/5 default). Web PWA + Android (Capacitor), offline-first, synced via Express + Neon + Render; Claude access through Website-MCP (`dayloop_*` tools). Public repo corixien/dayloop, folder ~/dayloop. See AGENTS.md for invariants, README for commands.

## Layout
`shared/` zod schemas | `server/` API, sync, auth, tests (PGlite) | `web/` React app, `web/src/lib` (db, sync, logic), `web/android` | `e2e/` Playwright | `docs/mcp.md`.

## Current state
- Done: server + sync (13 tests), web app all features (25 unit tests, Playwright e2e on desktop+mobile viewport), Android project builds (debug APK installs on the phone), widget + native reminders written, Website-MCP tools + tests written in ~/Website-MCP (NOT committed/pushed there; that repo also has the user's own uncommitted changes).
- Not done / open: on-device tests (phone was in personal use, no input sent), Neon project + Render service (user to create), production URL, push of this repo, release signing, drag-reorder inside lists.
- Local server for tests: `cd server && PORT=3100 PGLITE_DIR=/tmp/dl-e2e-pg npx tsx src/dev.ts`; `adb reverse tcp:3100 tcp:3100`.

## Next steps
1. User: create Neon project `dayloop`, Render service from render.yaml (DATABASE_URL), register, create API token, set DAYLOOP_URL/DAYLOOP_TOKEN in Horizon.
2. Device tests when the phone is free (check foreground app first).
3. Push repo and Website-MCP changes after user OK.
