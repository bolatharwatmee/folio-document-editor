import { Router } from "express";
import { z } from "zod";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  readSessionToken,
  setSessionCookie,
} from "./auth.js";
import type { AppConfig } from "./config.js";
import type { AppDatabase } from "./db.js";
import { badRequest } from "./errors.js";
import type { UserRow } from "./types.js";
import { toPublicUser } from "./types.js";
import { parseBody } from "./validation.js";

const signInSchema = z.object({ userId: z.string().min(1).max(100) }).strict();

export function createSessionRouter(db: AppDatabase, config: AppConfig): Router {
  const router = Router();

  router.get("/demo-users", (_req, res) => {
    const users = db
      .prepare("SELECT * FROM users ORDER BY name COLLATE NOCASE")
      .all() as unknown as UserRow[];
    res.set("Cache-Control", "no-store");
    res.json({ users: users.map(toPublicUser) });
  });

  router.post("/demo-session", (req, res) => {
    const body = parseBody(signInSchema, req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(body.userId) as UserRow | undefined;

    if (!user) {
      throw badRequest("unknown_user", "That demo account does not exist.");
    }

    const session = createSession(db, user.id, config.sessionTtlMs);
    setSessionCookie(res, session.token, config.sessionTtlMs, config.cookieSecure);
    res.set("Cache-Control", "no-store");
    res.json({ user: toPublicUser(user) });
  });

  router.get("/session", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ user: req.user ? toPublicUser(req.user) : null });
  });

  router.delete("/session", (req, res) => {
    const token = readSessionToken(req);
    if (token) {
      destroySession(db, token);
    }
    clearSessionCookie(res, config.cookieSecure);
    res.set("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  return router;
}
