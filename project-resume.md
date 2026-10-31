# Dayloop: project resume

## What
One todo list with deadlines (calendar), Have Done list (by day, sendable to the Productivity-Tracker), habits, pomodoro (25/5). Web PWA + Android (Capacitor), offline-first, Express + Neon + Render (`https://dayloop.onrender.com`); Claude access through Website-MCP (`dayloop_*`). Public repo corixien/dayloop, folder ~/dayloop. See AGENTS.md for product rules/invariants, README for commands.

## Layout
`shared/` zod schemas | `server/` API, sync, auth, tests (PGlite) | `web/` React app, `web/src/lib` (db, sync, logic), `web/android` | `e2e/` Playwright | `docs/mcp.md`.

## Current state
- Done: server + sync, simplified web app (Todo, Have Done, calendar, habits, pomodoro, settings incl. tracker + API tokens), custom dropdown, drag-following drawer/sheet/row swipes, Android build with new launcher icon, Website-MCP tools (committed and pushed), Render deploy live. Tests: server 13, web 31, Playwright e2e (desktop + mobile touch, fake tracker), MCP 37.
- Phone: production APK (VITE_API_URL=https://dayloop.onrender.com) installed; phone is not signed in yet (user logs in in Settings).
- Open: live check against the real tracker (needs the user's tracker URL/account), release signing, date/time pickers are still native.
- Local server for tests: `cd server && PORT=3100 PGLITE_DIR=/tmp/dl-e2e-pg npx tsx src/dev.ts`; debug build against it: `CAP_DEBUG=1 VITE_API_URL=http://localhost:3100`, `adb reverse tcp:3100 tcp:3100`.
