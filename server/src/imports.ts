import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireUser } from "./auth.js";
import {
  MAX_IMPORT_BYTES,
  extractPlainText,
  textToDocument,
  titleFromFilename,
} from "./content.js";
import type { AppDatabase } from "./db.js";
import { serializeDocument, getDocumentForUser } from "./documents.js";
import { HttpError } from "./errors.js";
import type { UserRow } from "./types.js";
import { parseBody } from "./validation.js";

const importSchema = z
  .object({
    filename: z.string().min(1).max(255),
    text: z.string(),
  })
  .strict();

export function createImportRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireUser);

  router.post("/", (req, res) => {
    const user = req.user as UserRow;
    const body = parseBody(importSchema, req.body);
    const filename = body.filename.trim();

    if (!/\.txt$/i.test(filename)) {
      throw new HttpError(
        400,
        "unsupported_file_type",
        "Only UTF-8 .txt files are supported. Choose a .txt file and try again.",
      );
    }

    if (Buffer.byteLength(body.text, "utf8") > MAX_IMPORT_BYTES) {
      throw new HttpError(
        413,
        "import_too_large",
        "That file is too large. The limit is 200 KB.",
      );
    }

    if (body.text.trim().length === 0) {
      throw new HttpError(
        400,
        "empty_file",
        "That file is empty. Add some text and try again.",
      );
    }

    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.text)) {
      throw new HttpError(
        400,
        "invalid_file",
        "That file contains unsupported control characters.",
      );
    }

    const content = textToDocument(body.text);
    const title = titleFromFilename(filename);
    const now = new Date().toISOString();
    const id = `doc_${crypto.randomUUID()}`;

    db.prepare(
      `INSERT INTO documents
        (id, title, content_json, plain_text, owner_id, revision, created_at, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      title,
      JSON.stringify(content),
      extractPlainText(content),
      user.id,
      now,
      now,
      user.id,
    );

    const row = getDocumentForUser(db, id, user.id);
    if (!row) {
      throw new Error("Imported document could not be read back.");
    }

    res.status(201).json({ document: serializeDocument(db, row) });
  });

  return router;
}
