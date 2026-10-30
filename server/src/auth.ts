import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { Db } from "./db.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_MS = 90 * 24 * 3600 * 1000;
export const TOKEN_PREFIX = "dl_";

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${h.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, s, h] = stored.split("$");
  if (alg !== "scrypt" || !s || !h) return false;
  const want = Buffer.from(h, "base64");
  const got = await scrypt(pw, Buffer.from(s, "base64"), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
}

export interface AuthedRequest extends Request {
  userId: string;
  /** true when authenticated by an API token (not allowed to manage tokens) */
  viaApiToken: boolean;
}

export class Auth {
  constructor(private db: Db, private secret: string) {}

  signAccess(userId: string): string {
    return jwt.sign({ sub: userId }, this.secret, { algorithm: "HS256", expiresIn: ACCESS_TTL_S });
  }

  async newSession(userId: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const refreshToken = randomBytes(32).toString("base64url");
    await this.db.query("delete from sessions where user_id=$1 and expires_at < now()", [userId]);
    await this.db.query("insert into sessions (user_id, token_hash, expires_at) values ($1,$2,$3)", [
      userId,
      sha256(refreshToken),
      new Date(Date.now() + REFRESH_TTL_MS),
    ]);
    return { accessToken: this.signAccess(userId), refreshToken, expiresIn: ACCESS_TTL_S };
  }

  /** Rotating refresh: the presented token is consumed. */
  async refresh(token: string) {
    const r = await this.db.query<{ user_id: string }>(
      "delete from sessions where token_hash=$1 and expires_at > now() returning user_id",
      [sha256(token)],
    );
    if (!r.rows[0]) return null;
    return this.newSession(r.rows[0].user_id);
  }

  async logout(token: string) {
    await this.db.query("delete from sessions where token_hash=$1", [sha256(token)]);
  }

  async createApiToken(userId: string, name: string) {
    const raw = TOKEN_PREFIX + randomBytes(24).toString("base64url");
    const r = await this.db.query<{ id: string }>(
      "insert into api_tokens (user_id, name, prefix, token_hash) values ($1,$2,$3,$4) returning id",
      [userId, name, raw.slice(0, 8), sha256(raw)],
    );
    return { id: r.rows[0].id, token: raw };
  }

  private async authenticate(bearer: string): Promise<{ userId: string; viaApiToken: boolean } | null> {
    if (bearer.startsWith(TOKEN_PREFIX)) {
      const r = await this.db.query<{ user_id: string; id: string }>(
        "select user_id, id from api_tokens where token_hash=$1",
        [sha256(bearer)],
      );
      if (!r.rows[0]) return null;
      this.db.query("update api_tokens set last_used_at=now() where id=$1", [r.rows[0].id]).catch(() => {});
      return { userId: r.rows[0].user_id, viaApiToken: true };
    }
    try {
      const p = jwt.verify(bearer, this.secret, { algorithms: ["HS256"] }) as { sub?: string };
      return p.sub ? { userId: p.sub, viaApiToken: false } : null;
    } catch {
      return null;
    }
  }

  middleware = async (req: Request, res: Response, next: NextFunction) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
    const who = m ? await this.authenticate(m[1]) : null;
    if (!who) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    Object.assign(req, who);
    next();
  };
}
