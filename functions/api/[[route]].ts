// Cloudflare Pages Function edge handler for Folio API
export interface Env {
  DB: D1Database;
}

interface EventContext {
  request: Request;
  env: Env;
  params: { route?: string[] };
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(rest.join("="));
    }
  }
  return cookies;
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function error(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: { code, message, ...(details ? { details } : {}) } }, status);
}

async function getUser(request: Request, db: D1Database) {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const token = cookies["folio_session"];
  if (!token) return null;
  const hash = await sha256(token);
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.color, u.role_label, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(hash, now)
    .first<any>();
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    color: row.color,
    roleLabel: row.role_label,
  };
}

export const onRequest = async (context: EventContext): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;
  const segments = context.params.route || [];
  const db = env.DB;

  if (!db) {
    return error(500, "database_missing", "D1 database binding not configured.");
  }

  // --- Health ---
  if (segments.length === 1 && segments[0] === "health") {
    return json({ ok: true });
  }

  // --- Demo Users ---
  if (segments.length === 1 && segments[0] === "demo-users") {
    const { results } = await db.prepare("SELECT * FROM users ORDER BY id ASC").all<any>();
    return json({
      users: results.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        color: u.color,
        roleLabel: u.role_label,
      })),
    });
  }

  // --- Session: GET ---
  if (segments.length === 1 && segments[0] === "session" && method === "GET") {
    const user = await getUser(request, db);
    return json({ user });
  }

  // --- Session: DELETE ---
  if (segments.length === 1 && segments[0] === "session" && method === "DELETE") {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const token = cookies["folio_session"];
    if (token) {
      const hash = await sha256(token);
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(hash).run();
    }
    return json(
      { ok: true },
      200,
      { "Set-Cookie": "folio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" },
    );
  }

  // --- Demo Session: POST ---
  if (segments.length === 1 && segments[0] === "demo-session" && method === "POST") {
    const body: any = await request.json().catch(() => ({}));
    if (!body.userId) {
      return error(400, "invalid_request", "userId is required.");
    }
    const user = await db
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(body.userId)
      .first<any>();
    if (!user) {
      return error(400, "unknown_user", "User not found.");
    }
    const token = crypto.randomUUID();
    const tokenHash = await sha256(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db
      .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, user.id, now.toISOString(), expiresAt)
      .run();

    const cookieHeader = `folio_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure`;
    return json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          color: user.color,
          roleLabel: user.role_label,
        },
      },
      200,
      { "Set-Cookie": cookieHeader },
    );
  }

  // Require user for remaining endpoints
  const currentUser = await getUser(request, db);
  if (!currentUser) {
    return error(401, "unauthorized", "Sign in to continue.");
  }

  // --- Documents: GET (List) ---
  if (segments.length === 1 && segments[0] === "documents" && method === "GET") {
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();

    const { results: ownedRows } = await db
      .prepare(
        `SELECT d.*, u.name as owner_name, u.email as owner_email, u.color as owner_color, u.role_label as owner_role_label,
         (SELECT COUNT(*) FROM document_shares ds WHERE ds.document_id = d.id) as share_count
         FROM documents d
         JOIN users u ON u.id = d.owner_id
         WHERE d.owner_id = ?
         ORDER BY d.updated_at DESC`,
      )
      .bind(currentUser.id)
      .all<any>();

    const { results: sharedRows } = await db
      .prepare(
        `SELECT d.*, s.role as share_role, s.created_at as shared_at,
         u.name as owner_name, u.email as owner_email, u.color as owner_color, u.role_label as owner_role_label,
         (SELECT COUNT(*) FROM document_shares ds WHERE ds.document_id = d.id) as share_count
         FROM document_shares s
         JOIN documents d ON d.id = s.document_id
         JOIN users u ON u.id = d.owner_id
         WHERE s.user_id = ?
         ORDER BY d.updated_at DESC`,
      )
      .bind(currentUser.id)
      .all<any>();

    const filterFn = (row: any) => {
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        row.plain_text.toLowerCase().includes(q) ||
        row.owner_name.toLowerCase().includes(q)
      );
    };

    const mapSummary = (r: any, isShared = false) => {
      const plain = (r.plain_text || "").replace(/\s+/g, " ").trim();
      return {
        id: r.id,
        title: r.title,
        snippet: plain.length > 180 ? `${plain.slice(0, 179)}…` : plain,
        revision: r.revision,
        owner: {
          id: r.owner_id,
          name: r.owner_name,
          email: r.owner_email,
          color: r.owner_color,
          roleLabel: r.owner_role_label,
        },
        access: isShared ? "shared" : "owner",
        shareRole: isShared ? (r.share_role || "editor") : "owner",
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        shareCount: Number(r.share_count || 0),
        ...(r.shared_at ? { sharedAt: r.shared_at } : {}),
      };
    };

    return json({
      owned: ownedRows.filter(filterFn).map((r) => mapSummary(r, false)),
      shared: sharedRows.filter(filterFn).map((r) => mapSummary(r, true)),
    });
  }

  // --- Documents: POST (Create) ---
  if (segments.length === 1 && segments[0] === "documents" && method === "POST") {
    const body: any = await request.json().catch(() => ({}));
    const id = `doc_${crypto.randomUUID()}`;
    const title = (body.title || "Untitled document").trim().slice(0, 120);
    const content = body.content || {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    const now = new Date().toISOString();
    const plainText = "";

    await db
      .prepare(
        `INSERT INTO documents (id, title, content_json, plain_text, owner_id, revision, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(id, title, JSON.stringify(content), plainText, currentUser.id, now, now, currentUser.id)
      .run();

    return json(
      {
        document: {
          id,
          title,
          snippet: "",
          revision: 1,
          owner: currentUser,
          access: "owner",
          shareRole: "owner",
          content,
          updatedBy: currentUser,
          canEdit: true,
          canShare: true,
          shares: [],
          createdAt: now,
          updatedAt: now,
          shareCount: 0,
        },
      },
      201,
    );
  }

  // --- Import: POST ---
  if (segments.length === 1 && segments[0] === "import" && method === "POST") {
    const body: any = await request.json().catch(() => ({}));
    const filename = body.filename || "";
    const text = body.text || "";

    if (!filename.toLowerCase().endsWith(".txt")) {
      return error(400, "unsupported_file_type", "Only UTF-8 .txt files are supported.");
    }
    if (text.length > 200 * 1024) {
      return error(413, "import_too_large", "The imported file is larger than 200 KB.");
    }
    if (text.trim().length === 0) {
      return error(400, "empty_file", "The imported file is empty.");
    }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) {
      return error(400, "invalid_file", "The file contains unsupported control characters.");
    }

    const cleanBase = filename.replace(/^.*[\\\/]/, "").replace(/\.txt$/i, "");
    const title = cleanBase.trim().slice(0, 120) || "Imported document";

    const lines = text.split(/\r?\n/);
    const paragraphs = lines.map((line: string) =>
      line.trim().length > 0
        ? { type: "paragraph", content: [{ type: "text", text: line }] }
        : { type: "paragraph" },
    );
    const content = { type: "doc", content: paragraphs };
    const plainText = text.slice(0, 1000);
    const id = `doc_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO documents (id, title, content_json, plain_text, owner_id, revision, created_at, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(id, title, JSON.stringify(content), plainText, currentUser.id, now, now, currentUser.id)
      .run();

    return json(
      {
        document: {
          id,
          title,
          snippet: plainText.slice(0, 180),
          revision: 1,
          owner: currentUser,
          access: "owner",
          shareRole: "owner",
          content,
          updatedBy: currentUser,
          canEdit: true,
          canShare: true,
          shares: [],
          createdAt: now,
          updatedAt: now,
          shareCount: 0,
        },
      },
      201,
    );
  }

  // --- Document by ID: GET / PATCH ---
  if (segments.length === 2 && segments[0] === "documents") {
    const docId = segments[1];

    const docRow = await db
      .prepare(
        `SELECT d.*,
         owner.name as owner_name, owner.email as owner_email, owner.color as owner_color, owner.role_label as owner_role_label,
         editor.name as editor_name, editor.email as editor_email, editor.color as editor_color, editor.role_label as editor_role_label,
         CASE WHEN d.owner_id = ? THEN 'owner' ELSE 'shared' END as access,
         s.role as share_role,
         (SELECT COUNT(*) FROM document_shares ds WHERE ds.document_id = d.id) as share_count
         FROM documents d
         JOIN users owner ON owner.id = d.owner_id
         JOIN users editor ON editor.id = d.updated_by
         LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ?
         WHERE d.id = ? AND (d.owner_id = ? OR s.user_id IS NOT NULL)`,
      )
      .bind(currentUser.id, currentUser.id, docId, currentUser.id)
      .first<any>();

    if (!docRow) {
      return error(404, "not_found", "Document not found or you do not have access.");
    }

    if (method === "GET") {
      let shares: any[] = [];
      if (docRow.access === "owner") {
        const { results } = await db
          .prepare(
            `SELECT u.*, s.role, s.created_at as shared_at
             FROM document_shares s
             JOIN users u ON u.id = s.user_id
             WHERE s.document_id = ?
             ORDER BY u.name COLLATE NOCASE`,
          )
          .bind(docId)
          .all<any>();
        shares = results.map((r) => ({
          user: {
            id: r.id,
            name: r.name,
            email: r.email,
            color: r.color,
            roleLabel: r.role_label,
          },
          role: r.role || "editor",
          sharedAt: r.shared_at,
        }));
      }

      const isViewer = docRow.access === "shared" && docRow.share_role === "viewer";

      return json({
        document: {
          id: docRow.id,
          title: docRow.title,
          snippet: docRow.plain_text.slice(0, 180),
          revision: docRow.revision,
          owner: {
            id: docRow.owner_id,
            name: docRow.owner_name,
            email: docRow.owner_email,
            color: docRow.owner_color,
            roleLabel: docRow.owner_role_label,
          },
          updatedBy: {
            id: docRow.updated_by,
            name: docRow.editor_name,
            email: docRow.editor_email,
            color: docRow.editor_color,
            roleLabel: docRow.editor_role_label,
          },
          access: docRow.access,
          shareRole: docRow.access === "owner" ? "owner" : (docRow.share_role || "editor"),
          canEdit: !isViewer,
          canShare: docRow.access === "owner",
          content: JSON.parse(docRow.content_json),
          createdAt: docRow.created_at,
          updatedAt: docRow.updated_at,
          shareCount: Number(docRow.share_count || 0),
          ...(docRow.access === "owner" ? { shares } : {}),
        },
      });
    }

    if (method === "PATCH") {
      if (docRow.access === "shared" && docRow.share_role === "viewer") {
        return error(403, "forbidden", "Viewers have read-only access and cannot edit this document.");
      }

      const body: any = await request.json().catch(() => ({}));
      if (typeof body.baseRevision !== "number") {
        return error(400, "invalid_request", "baseRevision is required.");
      }

      if (docRow.revision !== body.baseRevision) {
        return error(409, "conflict", "Someone else saved a newer version.", {
          document: {
            id: docRow.id,
            title: docRow.title,
            revision: docRow.revision,
            content: JSON.parse(docRow.content_json),
          },
        });
      }

      const newTitle = (body.title || docRow.title).trim().slice(0, 120);
      const newContent = body.content || JSON.parse(docRow.content_json);
      const now = new Date().toISOString();

      await db
        .prepare(
          `UPDATE documents
           SET title = ?, content_json = ?, revision = revision + 1, updated_at = ?, updated_by = ?
           WHERE id = ? AND revision = ?`,
        )
        .bind(newTitle, JSON.stringify(newContent), now, currentUser.id, docId, docRow.revision)
        .run();

      const updated = await db
        .prepare("SELECT * FROM documents WHERE id = ?")
        .bind(docId)
        .first<any>();

      return json({
        document: {
          id: updated.id,
          title: updated.title,
          revision: updated.revision,
          content: JSON.parse(updated.content_json),
          updatedAt: updated.updated_at,
          canEdit: true,
          canShare: docRow.access === "owner",
        },
      });
    }
  }

  // --- Document Shares: GET / POST ---
  if (segments.length === 3 && segments[0] === "documents" && segments[2] === "shares") {
    const docId = segments[1];
    const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first<any>();
    if (!doc || doc.owner_id !== currentUser.id) {
      return error(403, "forbidden", "Only the document owner can manage sharing.");
    }

    if (method === "GET") {
      const { results } = await db
        .prepare(
          `SELECT u.*, s.role, s.created_at as shared_at
           FROM document_shares s
           JOIN users u ON u.id = s.user_id
           WHERE s.document_id = ?
           ORDER BY u.name COLLATE NOCASE`,
        )
        .bind(docId)
        .all<any>();
      return json({
        shares: results.map((r) => ({
          user: {
            id: r.id,
            name: r.name,
            email: r.email,
            color: r.color,
            roleLabel: r.role_label,
          },
          role: r.role || "editor",
          sharedAt: r.shared_at,
        })),
      });
    }

    if (method === "POST") {
      const body: any = await request.json().catch(() => ({}));
      if (!body.userId) {
        return error(400, "invalid_request", "userId is required.");
      }
      if (body.userId === currentUser.id) {
        return error(400, "invalid_share", "You already own this document.");
      }
      const role = body.role === "viewer" ? "viewer" : "editor";
      const now = new Date().toISOString();

      await db
        .prepare(
          `INSERT INTO document_shares (document_id, user_id, role, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`,
        )
        .bind(docId, body.userId, role, now)
        .run();

      const { results } = await db
        .prepare(
          `SELECT u.*, s.role, s.created_at as shared_at
           FROM document_shares s
           JOIN users u ON u.id = s.user_id
           WHERE s.document_id = ?
           ORDER BY u.name COLLATE NOCASE`,
        )
        .bind(docId)
        .all<any>();

      return json({
        shares: results.map((r) => ({
          user: {
            id: r.id,
            name: r.name,
            email: r.email,
            color: r.color,
            roleLabel: r.role_label,
          },
          role: r.role || "editor",
          sharedAt: r.shared_at,
        })),
      });
    }
  }

  // --- Document Shares: DELETE ---
  if (segments.length === 4 && segments[0] === "documents" && segments[2] === "shares") {
    const docId = segments[1];
    const targetUserId = segments[3];
    const doc = await db.prepare("SELECT * FROM documents WHERE id = ?").bind(docId).first<any>();
    if (!doc || doc.owner_id !== currentUser.id) {
      return error(403, "forbidden", "Only the document owner can manage sharing.");
    }
    if (targetUserId === currentUser.id) {
      return error(400, "invalid_share", "The owner's access cannot be removed.");
    }

    await db
      .prepare("DELETE FROM document_shares WHERE document_id = ? AND user_id = ?")
      .bind(docId, targetUserId)
      .run();

    const { results } = await db
      .prepare(
        `SELECT u.*, s.role, s.created_at as shared_at
         FROM document_shares s
         JOIN users u ON u.id = s.user_id
         WHERE s.document_id = ?
         ORDER BY u.name COLLATE NOCASE`,
      )
      .bind(docId)
      .all<any>();

    return json({
      shares: results.map((r) => ({
        user: {
          id: r.id,
          name: r.name,
          email: r.email,
          color: r.color,
          roleLabel: r.role_label,
        },
        role: r.role || "editor",
        sharedAt: r.shared_at,
      })),
    });
  }

  return error(404, "not_found", "API endpoint not found.");
};
