# AGENTS.md

## Goal
Dayloop: one Todo list with optional deadlines (shown in the calendar), a Have Done list (finished things grouped by day, can be sent to the Productivity-Tracker), calendar, habits, pomodoro (default 25/5, adjustable, linkable to tasks). Web (PWA) + Android (Capacitor), offline-first, synced through one server. Claude reads/writes the same data through Website-MCP (`dayloop_*`, incl. `dayloop_kalender` for planning). DE/EN, light/dark. Deliberately simple: no multiple lists, tags, boards or matrix.

## Product rules
- Todo = open, non-trashed tasks; Have Done = tasks with `done` grouped by local day of `completedAt`; completing a todo moves it there, reopening moves it back. Typing in Have Done creates an already-done task.
- Repeating task: completing rolls the deadline forward and leaves a finished copy (so it appears in Have Done/calendar).
- Calendar: open tasks at their deadline; done tasks at the completion day (check chip), so completing removes the deadline entry.
- Old data may still carry `listId`/`tags`; the UI ignores them. Rows from older app versions get schema defaults on read (`Local.toItem`).
- Productivity-Tracker (`lib/tracker.ts`): settings hold URL + username + password in localStorage only (never synced). Paper plane per day in Have Done sends that day's unsent entries as one description to the tracker (`/api/groq` rate -> `/api/tasks` -> `/complete`), sent ids in localStorage. The tracker repo is not modified (CORS reflects any origin).
- UI: dropdowns use the custom `Select` (no native popup); drawer, sheet and row swipes follow the finger (`Drawer.tsx`, `Sheet.tsx`, `TaskRow.tsx`). Effects must return undefined or a function (a returned Promise crashes React).

## Stack
npm workspaces: `shared` (zod schemas + types, single source of truth), `server` (Express 5 + pg, Neon Postgres, deployed on Render, also serves `web/dist`), `web` (React + Vite + Tailwind + Dexie, Capacitor in `web/android`).

## Commands
- Install: `npm install`; check all: `npm run check`
- Server dev: `npm run dev:server` (needs `.env`, see `.env.example`); tests use in-process PGlite, never Neon.
- Web dev: `npm run dev:web`

## Data model and sync (read before touching `server/` or the web sync code)
- Every record is an envelope `{type,id,data,updatedAt,deleted}` in table `items`; `data` is validated by `shared` zod schemas per type (`folder,list,tag,task,habit,habitlog,pomodoro,settings`). Server fills defaults.
- Last-write-wins per record by client `updatedAt` (ms); older writes are rejected as `stale`. Deletes are tombstones.
- `seq` comes from one global sequence; all writers take advisory lock 7001 so seq order = commit order and the cursor never skips rows. Pull is paged (500, `hasMore`).
- `POST /api/sync` = push then pull. `GET /api/events` (SSE) pings with the new seq after any write; clients then sync. REST `/api/items/...` uses the server clock and is what MCP calls.
- Auth: JWT access (15 min) + rotating refresh token; API tokens `dl_...` (sha256 stored) for MCP, cannot manage tokens.
- habitlog id = `${habitId}_${date}`.

## Android (web/android, Capacitor 8)
- Web layer builds into `web/dist`; `npx cap sync android`; native code only for the widget (`TodayWidget`, `WidgetPlugin`, plugin name `DayloopWidget`). Reminders: `lib/reminders.ts` computes, `lib/native.ts` schedules OS notifications (channel `reminders`).
- compileSdk 37 (SDK platform 37 installed, 36 is not). Gradle uses JDK 21 from `~/.gradle/gradle.properties`.
- App id `com.dayloop.app`; API URL = build-time `VITE_API_URL`, overridable in Settings (native only).
- E2E: `e2e/` Playwright against `dev:local` on :3100.

## Rules
- Never commit secrets or `.env`. Neon project for Dayloop is its own project; never run tests/migrations against other projects.
- Device tests: phone is the user's own. Check the foreground app before scripted input; stop if it is not Dayloop.
- Push straight to `main`, no PRs.
