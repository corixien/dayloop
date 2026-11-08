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
- E2E: `e2e/` Playwright against `dev:local` (3100 may be taken by another project: `PORT=3190 npm run dev:local -w server`, `E2E_URL=http://localhost:3190 npx playwright test`).

## Rules
- Never commit secrets or `.env`. Neon project for Dayloop is its own project; never run tests/migrations against other projects.
- Device tests: phone is the user's own. Check the foreground app before scripted input; stop if it is not Dayloop.
- Push straight to `main`, no PRs.

## Notes and checklists
- Notes are plain text; lines `- [ ] x` / `- [x] x` are checklist items (`web/src/lib/notes.ts`, editor `NotesEditor`). The old `subtasks` field stays in the schema (MCP/import) and is moved into the notes the first time a task is opened. `extras()` in `taskLogic.ts` counts both.
- The widget snapshot carries `n` (plain note) / `c` (checklist) per row; the widget shows small icons next to the title.
- Ticking a checklist item stores `- [x@<ms>] text` (hidden in the editor); the calendar shows ticked items and completed tasks color coded by timing vs. deadline (before = green, on the day = accent, late = orange, no deadline = gray). A repeating task's finished copy keeps the old deadline.
- Calendar pinch (spread = closer: month > week > day) is handled in `Calendar.tsx`; `useSwipe` ignores multi-touch.
- Have Done: each entry has its own send button (tracker); the widget shows it too (`WRow.s`: 0 off, 1 send, 2 sent) and runs it through the overlay route `/overlay/track/<id>`. Tapping empty widget space (footer row, background) opens the app.
- Overlay activity keeps its WebView at alpha 0 until the overlay route calls `overlayReady()` (avoids a flash of the normal app).

## Calendar, focus, release
- Calendar (`Calendar.tsx`): `Body` renders one time frame; zooming (pinch, tapping a day/week, the Tag/Woche/Monat switch) cross-fades two `Body` layers scaled around the touch point (`paint`/`finish`). Finished todos and ticked checklist items sit at their completion time in the day/week grid (lane layout), habit completions in the all-day row, all color coded. Month cell tap = week, day number tap = day.
- Focus timer (`pomoStore.ts`): custom length (`state.custom`, next phase is normal), zen mode (`#/zen`, black screen filling purple, keeps screen on via `keepAwake`), Android side in `FocusNative`/`FocusAlarmReceiver`: live notification (chronometer countdown, promoted ongoing on Android 16 / One UI 8, tap opens overlay route `/overlay/focus`), exact end alarm that plays the chosen system sound (`listSounds`, device-local setting `dl_sound`). The widget overlay and the app share the timer through localStorage.
- Drafts (`TaskDetail.useDraft`): title/notes autosave 600 ms after typing, on blur and on unmount.
- Release APK: `cd web/android && ./gradlew assembleRelease`; signing config reads `~/.dayloop-release/keystore.properties` (outside the repo, back it up: without the key updates cannot be installed over existing installs). Debug and release builds have different signatures. The native app defaults to `https://dayloop.onrender.com`.

## Additions 2026-11-02
- Todo is one list without sections: `sortOpen` (taskLogic) puts deadlines within 24 h (or overdue) first, then priority, deadline, order. Every deadline also reminds 24 h before (`reminders.ts`).
- Timer end: AlarmManager -> `FocusAlarmReceiver` -> `FocusRingService` (looping alarm until stopped, 30 min cap, heads-up + full-screen intent to `/overlay/alarm`); web side `AlarmPopup`/`AlarmHost`.
- Refresh tokens stay valid 120 s after rotation (server) and `SyncClient` refreshes once at a time and rereads the shared session: do not revert, it prevents random logouts.
- Motivation page: texts, subscribed podcasts and the audio list are synced items (`motext`, `mofeed`, `moaudio`); audio files are server blobs (`/api/blobs/:id`, table `blobs`) cached in the local `dayloop-motivation.files` table and uploaded when online; downloaded episodes stay device-local. Podcast feeds go through `GET /api/feed` (auth, public hosts only).
- Groq key: `settings.groqKey` (synced), mirrored in localStorage `dl_groq` (`lib/groqKey.ts`).
- Todo rows must stay readable in grayscale: priority = `!` marks + ring thickness, deadline within 24 h = left bar + bold + clock icon.
- Assistant quality check: `GROQ_KEY=... npx vitest run src/lib/assistant.live.test.ts` (real Groq, real tools, in-memory db).

- Settings sync: `settings` also carries `groqKey`, tracker login (`trackerUrl/User/Pass`) and `trackerSent`; localStorage copies are mirrored both ways in `lib/groqKey.ts` (`adoptGroqKey`, `adoptTracker`, `pushTracker`). Device-only: `dl_server`, `dl_sound`, downloaded episodes.
- Calendar week view: finished chips (`ev.timing`) are tappable, open ones stay inert. Habit checkboxes are neutral gray.

## Additions 2026-11-05
- Appointments: `task.showBeforeMin` (null = ordinary task). An appointment is a task with date/time that `sortOpen` hides from Todo/widget until that many minutes before it starts; the calendar always shows it, completing it moves it to Have Done like any task. Calendar "+" (and N) opens `NewItem kind="event"` for the day in view (App dispatches `dl-new-event`); touch: hold an empty spot (week grid/header, month cell) to create there (day view: plain tap), mouse: double-click in the week grid. TaskDetail has an "Appointment" checkbox + lead field (`LeadField`).
- Notes editor (`NotesEditor`): each line is a textarea wrapped in zero-width sentinels (U+200B); the caret reaching a sentinel (space-bar slide, arrow keys) moves to the neighbouring line (document `selectionchange`, suppressed while a pointer is down), Backspace/Delete at line ends are detected through the removed sentinel. Anything reading a note textarea value must strip U+200B.
- Search bar (`CommandPalette`, Ctrl+K, `/`, sidebar): typo-tolerant `lib/fuzzy.ts`; typed text creates a todo / Have Done entry / appointment (`lib/quick.ts`, `parseQuick`: `Referat: a, b, c` -> checklist), Ctrl+Enter completes the selected task, habits can be ticked.
- Global audio player: `lib/player.ts` (one Audio element, MediaSession) + `MiniPlayer` above the tab bar; Motivation only calls `player.play`. Playback continues in the background (verified on the phone).
- Audio sync bug fixed: `files.uploaded` was queried without an index (Dexie v4 adds it), so `flushUploads` threw silently and nothing was ever uploaded.
- Assistant: `cleanTranscript` (small model repairs misheard words, e.g. "Kassi gehen" -> "Gassi gehen") runs on voice input before the main call; the page is a chat (bubbles, composer with mic).
- Widget overlay: closing the sheet calls `overlayPassThrough` (window becomes untouchable at once) and `finishOverlay` uses `finishAndRemoveTask`, so the home screen is usable while the overlay finishes syncing.

## Additions 2026-11-06
- Drawers (`Drawer.tsx`, `side="left|right"`): left = menu (pull it ~30 px past open -> closes and opens the search bar), right = assistant chat (same width, mounted lazily, not on the assistant page). `html/body` have `overscroll-behavior: none` so browser edge swipes (back/forward) never compete with them.
- Assistant chat history: one synced item `chat` id `main` (`lib/chat.ts`, trimmed to the last 20 questions by `lib/chatLog.ts`); shown on the assistant page and in the right drawer. Needs the server deploy (new item type).
- Search bar: Tab (or the "Details" button on create rows) opens a composer (title, notes editor with checklist, Ctrl+Enter adds); typed text still creates directly (`Title: a, b, c // note`).
- Notes formatting: `**bold**`, `*italic*`, `***both***` inside a line (`lib/notes.ts`: `parseMarks`, `stripMarks`, `toggleMark`). The line being edited shows raw text, other lines render formatted; Ctrl+B / Ctrl+I or the B/I buttons above the box. Use `stripMarks` wherever note text is compared or shown as plain text.
- Grayscale: priority colors follow importance in both themes (`--p1..p3` in `index.css`: light = darker is more important, dark = lighter), `!` marks and ring thickness remain; the tab bar marks the active page with a bar + bold; calendar finished chips use shape per timing (two ticks early, tick on the day, clock late); selected rows/chips use thicker rings. Widget uses the same palette and `!` marks in the meta line.
- Android audio: `MediaService` (foreground service type mediaPlayback) shows the system media notification / lock-screen controls for the web player (`lib/player.ts` -> plugin `mediaSync`/`mediaClear`; button presses return as `mediaAction` events). Tracks can have a `next` (audio list, episode list): auto-advance and a next button.
- Widget calendar tab (mode 2): `snapshot.events` = upcoming appointments grouped by day (next occurrence of repeating ones, up to 2 years); "+" there opens `/overlay/new/event`.
- Focus page layout: portrait = one column; landscape = ring left (sized from its grid cell with container query units), controls and stats right.

## Additions 2026-11-06 (round H)
- Notes editor: B/I bar sits inside the box below the lines (reserved, visible on focus), never over the title.
- Focus landscape: two equal columns, right column fills its half (weekly chart row `minmax(7rem,18rem)`, hidden when height <= 520px).
- Desktop: clicking empty space in the main area closes the side detail (`App.tsx`; buttons, rows, inputs, `[data-keep]` excluded).
- Sidebar active item has no inset bar (soft background + bold only). Assistant composer keeps 1.25rem bottom padding.

## Plan page (2026-11-08)
- Item type `plan` (shared `planSchema`: title, notes with checklist lines, date, start, end "HH:MM", end after start, latest 23:59). Sidebar "Plan" under Motivation (`/plan`, `components/Plan.tsx`): one day as a time axis (72 px/hour, 00:00 top to 24:00 bottom), centered on the current time (today) or on the first block, swipe/arrows/"Heute" change the day (no zoom levels), overlapping blocks are NOT side by side but stacked full width with a small indent per level (`lib/planLogic.ts` `stack`). FAB/`dl-new-plan` opens `PlanEditor` (sheet on phones/widget overlay, dialog on desktop); the default start is the end of the last block or now (rounded down to 5 min), whichever is later (`nextStart`), end = +1 h. Double click / long press on an empty spot creates a block there.
- MCP (Website-MCP): `dayloop_plan`, `_plan_hinzufuegen`, `_plan_aendern`, `_plan_loeschen`, `_plan_punkt_abhaken`, `_plan_tag_setzen`; the `life` skill reads the plan for the briefing and mentions it only if blocks exist. Needs the server deploy (new item type): a phone with plan items syncing against an older server gets its pushes rejected.
- Widget: fourth tab "Plan" (mode 3, snapshot `plan`: today and tomorrow with headers, `HH:MM–HH:MM` + checklist progress), plus = `/overlay/new/plan` (next free start), tap = `/overlay/plan/<id>`.
