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

- 2026-11-02: zen exit button; end-of-timer alarm = FocusRingService (foreground, looping, 30 min cap, heads-up + full-screen intent -> OverlayActivity /overlay/alarm, AlarmPopup also in-app via AlarmHost); calendar pinch reverses direction in one gesture, zoom-in lands on today if visible else the anchor (step() normalizes anchors), week view chips inert and only the weekday header zooms; one Todo list without sections (due within 24 h or overdue first, then priority, deadline; `sortOpen` in taskLogic), automatic 24 h reminder for every deadline (date-only deadlines use defaultReminderHour); reminders field under the deadline; habits ~20% bigger; widget task overlay: drag handle up opens the app on the list; Motivation page (sidebar only): own texts + audio (separate IndexedDB `dayloop-motivation`, not synced), podcasts via iTunes search + RSS through server proxy `/api/feed` (SSRF guard in server/src/feed.ts); logout fix: single in-flight refresh, shared-session reread between WebViews, 120 s grace for rotated refresh tokens (server). Fixed Pomodoro hooks-after-return crash on reload at #/zen. Phone had lost its session again ("Nur lokal"): user must log in once (Settings > Account).
- Open: AI voice assistant (plan only, see chat), release v1.0.2, Render deploy needed for server changes (grace + /api/feed).
- 2026-11-02 (later): voice assistant. `lib/assistant.ts` (Groq Whisper + chat tool loop, key in localStorage `dl_groq`, device only), `assistantTools.ts` (add/list/complete/update/delete task, add_done, habits, timer), `components/Assistant.tsx` (auto-stop on silence), sidebar page `/assistant`, overlay `/overlay/assistant`. Android: `DayloopAssistService` + `DayloopSessionService` (opens OverlayActivity via startAssistantActivity) + stub `DayloopRecognitionService`; RECORD_AUDIO. Verified: service registers, KEYCODE_ASSIST opens the sheet. Not verified with a real Groq key. User must pick Dayloop under Settings > Apps > Default apps > Digital assistant (button in Settings > Assistant) and set Side key long press to Digital assistant. Phone's assistant setting was restored to the Claude app after testing.
