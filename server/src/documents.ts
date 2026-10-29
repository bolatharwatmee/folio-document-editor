import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireUser } from "./auth.js";
import {
  cleanTitle,
  emptyDocument,
  extractPlainText,
  sanitizeRichText,
  type RichTextDoc,
} from "./content.js";
import type { AppDatabase } from "./db.js";
import { HttpError, forbidden, notFound } from "./errors.js";
import { parseBody } from "./validation.js";
import type {
  DocumentAccessRow,
  DocumentRole,
  PublicUser,
  ShareUserRow,
  UserRow,
} from "./types.js";
import { toPublicUser } from "./types.js";

interface DocumentSummary {
  id: string;
  title: string;
  snippet: string;
  revision: number;
  owner: PublicUser;
  access: "owner" | "shared";
  shareRole: DocumentRole;
  createdAt: string;
  updatedAt: string;
  shareCount: number;
  sharedAt?: string;
}

interface ShareEntry {
  user: PublicUser;
  role: "editor" | "viewer";
  sharedAt: string;
}

interface DocumentDetail extends DocumentSummary {
  content: RichTextDoc;
  updatedBy: PublicUser;
  canEdit: boolean;
  canShare: boolean;
  shares?: ShareEntry[];
}

const createSchema = z
  .object({
    title: z.string().optional(),
    content: z.unknown().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    title: z.string().optional(),
    content: z.unknown().optional(),
    baseRevision: z.number().int().min(1),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.content !== undefined, {
    message: "Provide a title or content to save.",
  });

const accessQuery = `
  SELECT
    d.id, d.title, d.content_json, d.plain_text, d.owner_id, d.revision,
    d.created_at, d.updated_at, d.updated_by,
    owner.name AS owner_name,
    owner.email AS owner_email,
    owner.color AS owner_color,
    owner.role_label AS owner_role_label,
    editor.name AS updated_by_name,
    editor.email AS updated_by_email,
    editor.color AS updated_by_color,
    editor.role_label AS updated_by_role_label,
    CASE WHEN d.owner_id = ? THEN 'owner' ELSE 'shared' END AS access,
    s.role AS share_role,
    (SELECT COUNT(*) FROM document_shares ds WHERE ds.document_id = d.id) AS share_count
  FROM documents d
  JOIN users owner ON owner.id = d.owner_id
  JOIN users editor ON editor.id = d.updated_by
  LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
  WHERE d.id = ? AND (d.owner_id = ? OR s.user_id IS NOT NULL)
`;

export function getDocumentForUser(
  db: AppDatabase,
  documentId: string,
  userId: string,
): DocumentAccessRow | undefined {
  return db.prepare(accessQuery).get(userId, userId, documentId, userId) as
    | DocumentAccessRow
    | undefined;
}

function ownerFromRow(row: DocumentAccessRow): PublicUser {
  return {
    id: row.owner_id,
    name: row.owner_name,
    email: row.owner_email,
    color: row.owner_color,
    roleLabel: row.owner_role_label,
  };
}

function updatedByFromRow(row: DocumentAccessRow): PublicUser {
  return {
    id: row.updated_by,
    name: row.updated_by_name,
    email: row.updated_by_email,
    color: row.updated_by_color,
    roleLabel: row.updated_by_role_label,
  };
}

export function listShares(db: AppDatabase, documentId: string): ShareEntry[] {
  const rows = db
    .prepare(
      `SELECT u.*, s.role, s.created_at AS shared_at
       FROM document_shares s
       JOIN users u ON u.id = s.user_id
       WHERE s.document_id = ?
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(documentId) as unknown as ShareUserRow[];

  return rows.map((row) => ({
    user: toPublicUser(row),
    role: row.role || "editor",
    sharedAt: row.shared_at,
  }));
}

function summarize(row: DocumentAccessRow, sharedAt?: string): DocumentSummary {
  const plain = row.plain_text.replace(/\s+/g, " ").trim();
  const isOwner = row.access === "owner";
  const summary: DocumentSummary = {
    id: row.id,
    title: row.title,
    snippet: plain.length > 180 ? `${plain.slice(0, 179)}…` : plain,
    revision: row.revision,
    owner: ownerFromRow(row),
    access: row.access,
    shareRole: isOwner ? "owner" : (row.share_role ?? "editor"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    shareCount: Number(row.share_count),
  };
  if (sharedAt) {
    summary.sharedAt = sharedAt;
  }
  return summary;
}

export function serializeDocument(
  db: AppDatabase,
  row: DocumentAccessRow,
  includeShares = true,
): DocumentDetail {
  const content = JSON.parse(row.content_json) as RichTextDoc;
  const isOwner = row.access === "owner";
  const isViewer = row.access === "shared" && row.share_role === "viewer";
  const detail: DocumentDetail = {
    ...summarize(row),
    content,
    updatedBy: updatedByFromRow(row),
    canEdit: !isViewer,
    canShare: isOwner,
  };
  if (includeShares && isOwner) {
    detail.shares = listShares(db, row.id);
  }
  return detail;
}

export function createDocumentsRouter(db: AppDatabase): Router {
  const router = Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const user = req.user as UserRow;
    const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

    const ownedRows = db
      .prepare(
        `SELECT
          d.id, d.title, d.content_json, d.plain_text, d.owner_id, d.revision,
          d.created_at, d.updated_at, d.updated_by,
          owner.name AS owner_name,
          owner.email AS owner_email,
          owner.color AS owner_color,
          owner.role_label AS owner_role_label,
          editor.name AS updated_by_name,
          editor.email AS updated_by_email,
          editor.color AS updated_by_color,
          editor.role_label AS updated_by_role_label,
          'owner' AS access,
          'owner' AS share_role,
          (SELECT COUNT(*) FROM document_shares ds WHERE ds.document_id = d.id) AS share_count
        FROM documents d
        JOIN users owner ON owner.id = d.owner_id
        JOIN users editor ON editor.id = d.updated_by
        WHERE d.owner_id = ?
        ORDER BY d.updated_at DESC`,
      )
      .all(user.id) as unknown as DocumentAccessRow[];

    const sharedRows = db
      .prepare(
        `SELECT
          d.id, d.title, d.content_json, d.plain_text, d.owner_id, d.revision,
          d.created_at, d.updated_at, d.updated_by,
          owner.name AS owner_name,
          owner.email AS owner_email,
          owner.color AS owner_color,
          owner.role_label AS owner_role_label,
          editor.name AS updated_by_name,
          editor.email AS updated_by_email,
          editor.color AS updated_by_color,
          editor.role_label AS updated_by_role_label,
          'shared' AS access,
          s.role AS share_role,
          s.created_at AS shared_at,
          (SELECT COUNT(*) FROM document_shares ds WHERE ds.document_id = d.id) AS share_count
        FROM document_shares s
        JOIN documents d ON d.id = s.document_id
        JOIN users owner ON owner.id = d.owner_id
        JOIN users editor ON editor.id = d.updated_by
        WHERE s.user_id = ?
        ORDER BY d.updated_at DESC`,
      )
      .all(user.id) as unknown as Array<DocumentAccessRow & { shared_at: string }>;

    const filterRow = (row: DocumentAccessRow) => {
      if (!query) return true;
      return (
        row.title.toLowerCase().includes(query) ||
        row.plain_text.toLowerCase().includes(query) ||
        row.owner_name.toLowerCase().includes(query)
      );
    };

    res.json({
      owned: ownedRows.filter(filterRow).map((row) => summarize(row)),
      shared: sharedRows.filter(filterRow).map((row) => summarize(row, row.shared_at)),
    });
  });

  router.post("/", (req, res) => {
    const user = req.user as UserRow;
    const body = parseBody(createSchema, req.body);

    const title = cleanTitle(body.title, "Untitled document");
    const content =
      body.content === undefined ? emptyDocument() : sanitizeRichText(body.content);
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
      throw new Error("Created document could not be read back.");
    }

    res.status(201).json({ document: serializeDocument(db, row) });
  });

  router.get("/:documentId", (req, res) => {
    const user = req.user as UserRow;
    const row = getDocumentForUser(db, req.params.documentId, user.id);
    if (!row) {
      throw notFound("Document not found or you do not have access.");
    }
    res.json({ document: serializeDocument(db, row) });
  });

  router.patch("/:documentId", (req, res) => {
    const user = req.user as UserRow;
    const documentId = req.params.documentId;
    const body = parseBody(updateSchema, req.body);
    const row = getDocumentForUser(db, documentId, user.id);

    if (!row) {
      throw notFound("Document not found or you do not have access.");
    }

    if (row.access === "shared" && row.share_role === "viewer") {
      throw forbidden("Viewers have read-only access and cannot edit this document.");
    }

    if (row.revision !== body.baseRevision) {
      throw new HttpError(
        409,
        "conflict",
        "Someone else saved a newer version. Your changes are still here; reload the latest version or save them as a copy.",
        { document: serializeDocument(db, row) },
      );
    }

    const title = body.title === undefined ? row.title : cleanTitle(body.title);
    const content =
      body.content === undefined
        ? sanitizeRichText(JSON.parse(row.content_json))
        : sanitizeRichText(body.content);
    const updatedAt = new Date().toISOString();

    const result = db
      .prepare(
        `UPDATE documents
         SET title = ?, content_json = ?, plain_text = ?, revision = revision + 1,
             updated_at = ?, updated_by = ?
         WHERE id = ? AND revision = ?`,
      )
      .run(
        title,
        JSON.stringify(content),
        extractPlainText(content),
        updatedAt,
        user.id,
        documentId,
        row.revision,
      );

    if (result.changes === 0) {
      const latest = getDocumentForUser(db, documentId, user.id);
      if (!latest) {
        throw notFound("Document not found or you no longer have access.");
      }
      throw new HttpError(
        409,
        "conflict",
        "Someone else saved a newer version. Your changes are still here; reload the latest version or save them as a copy.",
        { document: serializeDocument(db, latest) },
      );
    }

    const updated = getDocumentForUser(db, documentId, user.id);
    if (!updated) {
      throw new Error("Updated document could not be read back.");
    }
    res.json({ document: serializeDocument(db, updated) });
  });

  return router;
}

export type { DocumentDetail, DocumentSummary, ShareEntry };
