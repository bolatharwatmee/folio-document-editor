import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { attachUser } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { AppDatabase } from "./db.js";
import { createDocumentsRouter } from "./documents.js";
import { HttpError } from "./errors.js";
import { createImportRouter } from "./imports.js";
import { createSessionRouter } from "./session.js";
import { createSharingRouter } from "./sharing.js";

export interface CreateAppOptions {
  db: AppDatabase;
  config: AppConfig;
  staticDir?: string;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createApp({ db, config, staticDir }: CreateAppOptions) {
  const app = express();
  app.disable("x-powered-by");
  if (config.isProduction) {
    app.set("trust proxy", 1);
  }

  app.use((_req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    });
    if (config.cookieSecure) {
      res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use((req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    if (req.headers["sec-fetch-site"] === "cross-site") {
      res.status(403).json({
        error: {
          code: "cross_origin_request",
          message: "Cross-site writes are not allowed.",
        },
      });
      return;
    }

    const origin = req.headers.origin;
    if (!origin) {
      next();
      return;
    }

    const expectedOrigin =
      config.appOrigin ?? `${req.protocol}://${req.get("host") ?? "localhost"}`;
    if (origin !== expectedOrigin) {
      res.status(403).json({
        error: {
          code: "cross_origin_request",
          message: "Cross-site writes are not allowed.",
        },
      });
      return;
    }
    next();
  });

  app.use(express.json({ limit: "2mb" }));
  app.use(attachUser(db));

  app.get("/api/health", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  app.use("/api", createSessionRouter(db, config));
  app.use("/api/documents", createDocumentsRouter(db));
  app.use("/api/documents", createSharingRouter(db));
  app.use("/api/import", createImportRouter(db));

  app.use("/api", (_req, res) => {
    res.status(404).json({
      error: { code: "not_found", message: "API route not found." },
    });
  });

  if (staticDir && fs.existsSync(staticDir)) {
    const indexPath = path.join(staticDir, "index.html");
    app.use(
      "/assets",
      express.static(path.join(staticDir, "assets"), {
        immutable: true,
        maxAge: "1y",
      }),
    );
    app.use(express.static(staticDir, { index: false }));
    app.use((req, res, next) => {
      if (req.method !== "GET" || req.path.startsWith("/api")) {
        next();
        return;
      }
      res.set("Cache-Control", "no-cache");
      res.sendFile(indexPath);
    });
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: "not_found", message: "Not found." },
    });
  });

  app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof HttpError) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      });
      return;
    }

    if (
      error instanceof SyntaxError &&
      "type" in error &&
      (error as { type?: string }).type === "entity.parse.failed"
    ) {
      res.status(400).json({
        error: { code: "invalid_json", message: "The request body is not valid JSON." },
      });
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      (error as { type?: string }).type === "entity.too.large"
    ) {
      res.status(413).json({
        error: { code: "request_too_large", message: "The request body is too large." },
      });
      return;
    }

    console.error(
      `[api] ${req.method} ${req.path} failed:`,
      error instanceof Error ? error.message : "Unknown error",
    );
    res.status(500).json({
      error: {
        code: "internal_error",
        message: "Something went wrong on the server. Please try again.",
      },
    });
  });

  return app;
}
