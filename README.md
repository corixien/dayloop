# Dayloop

Tasks, habits, calendar and pomodoro in one app. Web and Android, offline-first, synced. Claude can read and change your data through an MCP server.

## Run locally
```bash
npm install
cp .env.example .env   # fill DATABASE_URL and JWT_SECRET
npm run dev:server        # Express + Neon (needs .env)
# or without Neon: in-process Postgres, serves web/dist on :3000
npm run dev:local
npm run dev:web           # Vite on :5173, proxies /api
```

## Deploy
Neon (Postgres) + Render (`render.yaml`). Set `DATABASE_URL` in Render. The server also serves the built web app.

## Claude / MCP
Create an API token in Settings and give it to the MCP server as `DAYLOOP_TOKEN` (plus `DAYLOOP_URL`). See `docs/mcp.md`.

## Tests
`npm run check`

## Android
```bash
cd web
VITE_API_URL=https://<your-render-url> npm run build
npx cap sync android
cd android && ./gradlew assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
```
Local server on the phone: `adb reverse tcp:3100 tcp:3100`, build with `CAP_DEBUG=1 VITE_API_URL=http://localhost:3100`.
Features: native reminders (alarms survive restarts), home screen widget "Heute".

## E2E
`npm run build -w web && npm run dev:local` (PORT=3100) then `npx playwright test` (uses installed Chrome).
