import type { AppDatabase } from "./db.js";
import {
  extractPlainText,
  sanitizeRichText,
  type RichTextDoc,
  type RichTextMark,
  type RichTextNode,
} from "./content.js";

type MarkType = RichTextMark["type"];

function text(value: string, marks?: MarkType[]): RichTextNode {
  const node: RichTextNode = { type: "text", text: value };
  if (marks && marks.length > 0) {
    node.marks = marks.map((type) => ({ type }));
  }
  return node;
}

function paragraph(...content: RichTextNode[]): RichTextNode {
  return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
}

function heading(level: 1 | 2 | 3, ...content: RichTextNode[]): RichTextNode {
  return { type: "heading", attrs: { level }, content };
}

function listItem(...content: RichTextNode[]): RichTextNode {
  return { type: "listItem", content };
}

function bulletList(...items: RichTextNode[]): RichTextNode {
  return { type: "bulletList", content: items };
}

function orderedList(...items: RichTextNode[]): RichTextNode {
  return { type: "orderedList", attrs: { start: 1 }, content: items };
}

const SEED_USERS = [
  {
    id: "usr_alice",
    name: "Alice Nguyen",
    email: "alice@folio.demo",
    color: "#0f766e",
    roleLabel: "Owner account",
  },
  {
    id: "usr_bob",
    name: "Bob Ortega",
    email: "bob@folio.demo",
    color: "#b45309",
    roleLabel: "Shared recipient",
  },
  {
    id: "usr_carol",
    name: "Carol Sato",
    email: "carol@folio.demo",
    color: "#6d28d9",
    roleLabel: "Unrelated reviewer",
  },
] as const;

interface SeedDocument {
  id: string;
  title: string;
  ownerId: string;
  updatedMinutesAgo: number;
  content: RichTextDoc;
}

function seedDocuments(): SeedDocument[] {
  return [
    {
      id: "doc_welcome",
      title: "Welcome to Folio",
      ownerId: "usr_alice",
      updatedMinutesAgo: 12,
      content: {
        type: "doc",
        content: [
          heading(1, text("Welcome to Folio")),
          paragraph(
            text("Folio is a "),
            text("small, deliberate", ["bold"]),
            text(" document editor: it keeps the required collaborative-writing slice and leaves the rest out."),
          ),
          heading(2, text("What you can do")),
          bulletList(
            listItem(paragraph(text("Create, rename, and reopen documents."))),
            listItem(
              paragraph(
                text("Format with "),
                text("bold", ["bold"]),
                text(", "),
                text("italic", ["italic"]),
                text(", and "),
                text("underline", ["underline"]),
                text("."),
              ),
            ),
            listItem(paragraph(text("Use headings, bulleted lists, and numbered lists."))),
            listItem(paragraph(text("Share a document with another demo user."))),
            listItem(paragraph(text("Import a UTF-8 .txt file into a new document."))),
          ),
          heading(2, text("Saving is explicit")),
          paragraph(
            text(
              "Press Save or Cmd/Ctrl+S. Folio only shows “Saved” after the server confirms the write. If another editor saves first, the stale write is rejected instead of silently overwriting newer work.",
            ),
          ),
          heading(2, text("Try the shared flow")),
          orderedList(
            listItem(paragraph(text("Edit this document and save."))),
            listItem(paragraph(text("Open Share (owner only) and give Bob access."))),
            listItem(
              paragraph(
                text("Switch to Bob from the account menu; this document appears under Shared with me."),
              ),
            ),
          ),
          paragraph(
            text("Seeded demo content. Only synthetic accounts and data are used.", ["italic"]),
          ),
        ],
      },
    },
    {
      id: "doc_bob_launch",
      title: "Launch notes: shared workspace",
      ownerId: "usr_bob",
      updatedMinutesAgo: 125,
      content: {
        type: "doc",
        content: [
          heading(1, text("Launch notes: shared workspace")),
          paragraph(
            text("Bob owns this document and shared it with Alice. Shared people can edit, but only the owner can change access."),
          ),
          heading(2, text("Open questions")),
          bulletList(
            listItem(paragraph(text("Which import error states need screenshots?"))),
            listItem(paragraph(text("Who records the four-minute walkthrough?"))),
            listItem(paragraph(text("Is the deployment target approved yet?"))),
          ),
          paragraph(
            text("Use this document to verify that Alice and Bob see the same saved content."),
          ),
        ],
      },
    },
    {
      id: "doc_carol_private",
      title: "Carol's private memo",
      ownerId: "usr_carol",
      updatedMinutesAgo: 1_500,
      content: {
        type: "doc",
        content: [
          heading(1, text("Carol's private memo")),
          paragraph(
            text("This document belongs to Carol and is not shared with anyone. Alice and Bob should not be able to list or open it."),
          ),
          heading(2, text("Access check")),
          paragraph(
            text("Requests from Alice or Bob should return 404 even with the exact document ID."),
          ),
        ],
      },
    },
  ];
}

const SEED_SHARES = [
  { documentId: "doc_welcome", userId: "usr_bob" },
  { documentId: "doc_bob_launch", userId: "usr_alice" },
];

export function seedDatabase(db: AppDatabase): void {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const upsertUser = db.prepare(`
    INSERT INTO users (id, name, email, color, role_label, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      color = excluded.color,
      role_label = excluded.role_label
  `);

  const insertDocument = db.prepare(`
    INSERT OR IGNORE INTO documents
      (id, title, content_json, plain_text, owner_id, revision, created_at, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  const insertShare = db.prepare(`
    INSERT OR IGNORE INTO document_shares (document_id, user_id, role, created_at)
    VALUES (?, ?, 'editor', ?)
  `);

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const user of SEED_USERS) {
      upsertUser.run(user.id, user.name, user.email, user.color, user.roleLabel, nowIso);
    }

    for (const document of seedDocuments()) {
      const content = sanitizeRichText(document.content);
      const updatedAt = new Date(now - document.updatedMinutesAgo * 60_000).toISOString();
      const createdAt = new Date(now - 72 * 60 * 60_000).toISOString();
      insertDocument.run(
        document.id,
        document.title,
        JSON.stringify(content),
        extractPlainText(content),
        document.ownerId,
        createdAt,
        updatedAt,
        document.ownerId,
      );
    }

    for (const share of SEED_SHARES) {
      insertShare.run(share.documentId, share.userId, nowIso);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
