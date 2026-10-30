import { resolve } from "node:path";
import { createApp } from "./app.js";
import { migrate, pgDb } from "./db.js";

const url = process.env.DATABASE_URL;
const jwtSecret = process.env.JWT_SECRET;
if (!url || !jwtSecret) {
  console.error("DATABASE_URL and JWT_SECRET are required");
  process.exit(1);
}

const db = pgDb(url);
await migrate(db);

const app = createApp({
  db,
  jwtSecret,
  allowRegistration: process.env.ALLOW_REGISTRATION !== "false",
  webDir: resolve(process.env.WEB_DIR ?? "../web/dist"),
});
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`dayloop server on :${port}`));
