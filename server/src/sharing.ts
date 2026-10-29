import { Router } from "express";
import { z } from "zod";
import { requireUser } from "./auth.js";
import type { AppDatabase } from "./db.js";
import { getDocumentForUser, listShares } from "./documents.js";
import { HttpError, badRequest, forbidden, notFound } from "./errors.js";
import type { UserRow } from "./types.js";
import { parseBody } from "./validation.js";

const shareSchema = z
  .object({
    userId: z.string().min(1).max(100),
    role: z.enum(["editor", "viewer"]).default("editor"),
  })
  .strict();

function requireOwner(db: AppDatabase, documentId: string, userId: string) {
  const row = getDocumentForUser(db, documentId, userId);
  if (!row) {
    throw notFound("Document not found or you do not have access.");
  }
  if (row.access !== "owner") {
    throw forbidden("Only the document owner can manage sharing.");
  }
  return row;
}

export function createSharingRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/:documentId/shares", (req, res) => {
    const user = req.user as UserRow;
    requireOwner(db, req.params.documentId, user.id);
    res.json({ shares: listShares(db, req.params.documentId) });
  });

  router.post("/:documentId/shares", (req, res) => {
    const user = req.user as UserRow;
    const documentId = req.params.documentId;
    const body = parseBody(shareSchema, req.body);
    requireOwner(db, documentId, user.id);

    const target = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(body.userId) as UserRow | undefined;
    if (!target) {
      throw badRequest("unknown_user", "That demo user does not exist.");
    }
    if (target.id === user.id) {
      throw new HttpError(400, "invalid_share", "You already own this document.");
    }

    db.prepare(
      `INSERT INTO document_shares (document_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(document_id, user_id) DO UPDATE SET
         role = excluded.role`,
    ).run(documentId, target.id, body.role, new Date().toISOString());

    res.json({ shares: listShares(db, documentId) });
  });

  router.delete("/:documentId/shares/:userId", (req, res) => {
    const user = req.user as UserRow;
    const documentId = req.params.documentId;
    requireOwner(db, documentId, user.id);

    if (req.params.userId === user.id) {
      throw new HttpError(400, "invalid_share", "The owner's access cannot be removed.");
    }

    db.prepare(
      "DELETE FROM document_shares WHERE document_id = ? AND user_id = ?",
    ).run(documentId, req.params.userId);

    res.json({ shares: listShares(db, documentId) });
  });

  return router;
}
