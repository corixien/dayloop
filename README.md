# Dayloop

Tasks, habits, calendar and pomodoro in one app. Web and Android, offline-first, synced. Claude can read and change your data through an MCP server.

## Run locally
```bash
npm install
cp .env.example .env   # fill DATABASE_URL and JWT_SECRET
npm run dev:server
npm run dev:web
```

## Deploy
Neon (Postgres) + Render (`render.yaml`). Set `DATABASE_URL` in Render. The server also serves the built web app.

## Claude / MCP
Create an API token in Settings and give it to the MCP server as `DAYLOOP_TOKEN` (plus `DAYLOOP_URL`). See `docs/mcp.md`.

## Tests
`npm run check`
