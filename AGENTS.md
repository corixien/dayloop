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
- Web layer builds into `web/dist`; `npx cap sync android`. compileSdk 37 (platform 37 installed, 36 is not). Gradle uses JDK 21 from `~/.gradle/gradle.properties`; build with `./gradlew assembleDebug` in `web/android`. App id `com.dayloop.app`; API URL = build-time `VITE_API_URL` (prod: `https://dayloop.onrender.com`), overridable in Settings (native only).
- Reminders: `lib/reminders.ts` computes, `lib/native.ts` schedules OS notifications (channel `reminders`).
- Home screen widget (`DayloopWidget`, `WidgetService`, `WidgetStore`, `WidgetConfigActivity`, `WidgetRouterActivity`, `OverlayActivity`, plugin `DayloopWidget`):
  - Data: the web layer pushes a pre-formatted snapshot (`lib/widgetSnapshot.ts`: header + task rows for Todo and Have Done) through `DayloopWidget.update`; native only renders it (RemoteViews + ListView).
  - Ticking a row: list item taps go to the invisible `WidgetRouterActivity` (one PendingIntent template per list). `toggle` -> broadcast -> optimistic snapshot change (`WidgetStore.applyToggle`) + `PATCH /api/items/task/:id` with a dedicated API token ("Android Widget", created by `ensureCredentials`, stored natively); HttpURLConnection cannot PATCH, so it POSTs with `X-HTTP-Method-Override: PATCH` (server middleware). Failures and repeating tasks go to a pending queue the app applies on resume (`applyPendingWidgetActions`, idempotent set-done).
  - `open` and the plus button start `OverlayActivity` (own task, translucent theme, `BridgeActivity` with transparent WebView) at hash route `/overlay/task/<id>` or `/overlay/new/<todo|done>`; `components/Overlay.tsx` renders the same bottom sheets over the home screen; closing syncs first, then `finishOverlay`.
  - Per-widget settings (background color/opacity, corners, font size, default tab, plus button) live in `WidgetStore.Cfg` (SharedPreferences, keyed by widget id); the config activity opens when adding and on long-press > settings (`reconfigurable`).
  - Reading app-private storage (tokens) with `adb run-as` is not allowed here: test the MCP/server path with a token the user creates.
- `useItems` re-queries when the app returns to the foreground (another WebView, the overlay, may have written IndexedDB).
- E2E: `e2e/` Playwright against `dev:local` on :3100.

## Rules
- Never commit secrets or `.env`. Neon project for Dayloop is its own project; never run tests/migrations against other projects.
- Device tests: phone is the user's own. Check the foreground app before scripted input; stop if it is not Dayloop.
- Push straight to `main`, no PRs.

## Notes and checklists
- Notes are plain text; lines `- [ ] x` / `- [x] x` are checklist items (`web/src/lib/notes.ts`, editor `NotesEditor`). The old `subtasks` field stays in the schema (MCP/import) and is moved into the notes the first time a task is opened. `extras()` in `taskLogic.ts` counts both.
- The widget snapshot carries `n` (plain note) / `c` (checklist) per row; the widget shows small icons next to the title.
- Overlay activity keeps its WebView at alpha 0 until the overlay route calls `overlayReady()` (avoids a flash of the normal app).
