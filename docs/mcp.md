# Claude / MCP access

Claude reads and writes Dayloop through `Website-MCP` (tools `dayloop_*`), which calls this app's REST API with a personal API token. Every change goes through the same store as the apps, so phone, web and Claude always see the newest data (apps pick up changes within seconds via the SSE channel).

## Setup
1. Deploy Dayloop (Neon + Render, see README) and register in the app.
2. Dayloop > Settings > "API-Tokens": create a token named "Claude". It starts with `dl_` and is shown once.
3. In Horizon (Website-MCP) set secrets `DAYLOOP_URL` (e.g. `https://dayloop.onrender.com`, no trailing slash) and `DAYLOOP_TOKEN`.
4. Push Website-MCP to `main` (Horizon redeploys in 1-2 minutes), then start a new Claude session or reload the connector.

## REST API used
Auth: `Authorization: Bearer dl_...`. A token cannot create or list tokens.

| Call | Purpose |
|---|---|
| `GET /api/items?type=task\|list\|habit\|habitlog\|pomodoro\|settings` | list non-deleted items |
| `GET /api/items/:type/:id` | one item |
| `POST /api/items/:type` `{id?, data}` | create / replace (server fills defaults) |
| `PATCH /api/items/:type/:id` `{data}` | merge fields |
| `DELETE /api/items/:type/:id` | tombstone (MCP uses trash instead) |
| `GET /api/events` | SSE, one `data: <seq>` line per change |

Item `data` schemas live in `shared/src/index.ts`. Revoke a token in Settings at any time.
