import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { AppDatabase } from "./db.js";
import type { UserRow } from "./types.js";
import { unauthorized } from "./errors.js";

export const SESSION_COOKIE = "folio_session";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    if (key !== name) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

export function createSession(
  db: AppDatabase,
  userId: string,
  ttlMs: number,
): { token: string; expiresAt: string } {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now.toISOString());

  const token = crypto.randomBytes(32).toString("base64url");
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), userId, now.toISOString(), expiresAt);

  return { token, expiresAt };
}

export function destroySession(db: AppDatabase, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function readSessionToken(req: Request): string | undefined {
  return readCookie(req.headers.cookie, SESSION_COOKIE);
}

export function setSessionCookie(
  res: Response,
  token: string,
  ttlMs: number,
  secure: boolean,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ttlMs,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
  });
}

export function attachUser(db: AppDatabase) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = readSessionToken(req);
    if (!token) {
      next();
      return;
    }

    const user = db
      .prepare(
        `SELECT u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(hashToken(token), new Date().toISOString()) as UserRow | undefined;

    if (user) {
      req.user = user;
    }
    next();
  };
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    const error = unauthorized("Sign in with a demo account to continue.");
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }
  next();
}
