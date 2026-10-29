import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { openDatabase, type AppDatabase } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";

const baseConfig: AppConfig = {
  port: 0,
  databasePath: ":memory:",
  cookieSecure: false,
  isProduction: false,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
};

const openDatabases: AppDatabase[] = [];
const tempDirectories: string[] = [];

function makeApp(configOverrides: Partial<AppConfig> = {}, databasePath = ":memory:") {
  const db = openDatabase(databasePath);
  openDatabases.push(db);
  seedDatabase(db);
  const config: AppConfig = {
    ...baseConfig,
    databasePath,
    ...configOverrides,
  };
  return { app: createApp({ db, config }), db, config };
}

function closeDb(db: AppDatabase): void {
  db.close();
  const index = openDatabases.indexOf(db);
  if (index >= 0) {
    openDatabases.splice(index, 1);
  }
}

function makeTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "folio-test-"));
  tempDirectories.push(directory);
  return directory;
}

async function signIn(app: ReturnType<typeof createApp>, userId: string) {
  const agent = request.agent(app);
  await agent.post("/api/demo-session").send({ userId }).expect(200);
  return agent;
}

async function sessionCookie(
  app: ReturnType<typeof createApp>,
  userId: string,
): Promise<string> {
  const response = await request(app)
    .post("/api/demo-session")
    .send({ userId })
    .expect(200);
  const setCookie = response.headers["set-cookie"] as unknown as string[];
  return setCookie[0].split(";")[0];
}

function formattedDocument() {
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "A heading" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: " italic", marks: [{ type: "italic" }] },
          { type: "text", text: " underline", marks: [{ type: "underline" }] },
        ],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "bullet one" }],
              },
            ],
          },
        ],
      },
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "numbered one" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function simpleDocument(text: string) {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    try {
      db.close();
    } catch {
      // Already closed by a restart test.
    }
  }
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("session and health", () => {
  it("serves health and rejects document access without a session", async () => {
    const { app } = makeApp();

    await request(app).get("/api/health").expect(200, { ok: true });
    await request(app).get("/api/documents").expect(401);
    const session = await request(app).get("/api/session").expect(200);
    expect(session.body.user).toBeNull();
  });

  it("creates a server-side demo session with an HttpOnly cookie", async () => {
    const { app } = makeApp();
    const response = await request(app)
      .post("/api/demo-session")
      .send({ userId: "usr_alice" })
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: "usr_alice",
      name: "Alice Nguyen",
    });
    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie[0]).toContain("folio_session=");
    expect(setCookie[0]).toContain("HttpOnly");
    expect(setCookie[0]).toContain("SameSite=Lax");
  });

  it("returns a null session after signing out", async () => {
    const { app } = makeApp();
    const agent = await signIn(app, "usr_alice");

    await agent.delete("/api/session").expect(200, { ok: true });
    const session = await agent.get("/api/session").expect(200);
    expect(session.body.user).toBeNull();
  });
});

describe("documents and formatting", () => {
  it("creates, renames, saves, lists, and reopens a document with formatting", async () => {
    const { app } = makeApp();
    const agent = await signIn(app, "usr_alice");

    const created = await agent
      .post("/api/documents")
      .send({ title: "Draft one" })
      .expect(201);
    const documentId = created.body.document.id as string;
    expect(created.body.document).toMatchObject({
      title: "Draft one",
      revision: 1,
      access: "owner",
      canShare: true,
    });

    const content = formattedDocument();
    const saved = await agent
      .patch(`/api/documents/${documentId}`)
      .send({
        title: "Renamed draft",
        content,
        baseRevision: 1,
      })
      .expect(200);

    expect(saved.body.document).toMatchObject({
      title: "Renamed draft",
      revision: 2,
      access: "owner",
    });
    expect(saved.body.document.content).toEqual(content);

    const reopened = await agent.get(`/api/documents/${documentId}`).expect(200);
    expect(reopened.body.document.title).toBe("Renamed draft");
    expect(reopened.body.document.content).toEqual(content);
    expect(reopened.body.document.snippet).toContain("A heading");

    const list = await agent.get("/api/documents").expect(200);
    expect(list.body.owned).toHaveLength(2);
    expect(list.body.shared).toHaveLength(1);
    expect(
      list.body.owned.find((doc: { id: string }) => doc.id === documentId),
    ).toMatchObject({
      id: documentId,
      title: "Renamed draft",
      access: "owner",
      revision: 2,
    });
  });

  it("rejects stale saves instead of overwriting newer content", async () => {
    const { app } = makeApp();
    const alice = await signIn(app, "usr_alice");
    const bob = await signIn(app, "usr_bob");

    const aliceView = await alice.get("/api/documents/doc_welcome").expect(200);
    const bobView = await bob.get("/api/documents/doc_welcome").expect(200);
    expect(aliceView.body.document.revision).toBe(1);
    expect(bobView.body.document.revision).toBe(1);

    await bob
      .patch("/api/documents/doc_welcome")
      .send({
        content: simpleDocument("Bob saved this first"),
        baseRevision: 1,
      })
      .expect(200);

    const conflict = await alice
      .patch("/api/documents/doc_welcome")
      .send({
        content: simpleDocument("Alice tried to overwrite it"),
        baseRevision: 1,
      })
      .expect(409);

    expect(conflict.body.error.code).toBe("conflict");
    expect(conflict.body.error.details.document.revision).toBe(2);

    const latest = await alice.get("/api/documents/doc_welcome").expect(200);
    expect(latest.body.document.revision).toBe(2);
    expect(JSON.stringify(latest.body.document.content)).toContain("Bob saved this first");
    expect(JSON.stringify(latest.body.document.content)).not.toContain(
      "Alice tried to overwrite it",
    );
  });

  it("rejects unsupported rich-text nodes, marks, and oversized titles", async () => {
    const { app } = makeApp();
    const agent = await signIn(app, "usr_alice");

    const badNode = await agent
      .post("/api/documents")
      .send({
        title: "Bad node",
        content: {
          type: "doc",
          content: [{ type: "script", text: "alert(1)" }],
        },
      })
      .expect(400);
    expect(badNode.body.error.code).toBe("invalid_content");

    const badMark = await agent
      .post("/api/documents")
      .send({
        title: "Bad mark",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "click",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
          ],
        },
      })
      .expect(400);
    expect(badMark.body.error.code).toBe("invalid_content");

    const badHeading = await agent
      .post("/api/documents")
      .send({
        title: "Bad heading",
        content: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 9 },
              content: [{ type: "text", text: "Nope" }],
            },
          ],
        },
      })
      .expect(400);
    expect(badHeading.body.error.code).toBe("invalid_content");

    const badTitle = await agent
      .post("/api/documents")
      .send({ title: "x".repeat(121) })
      .expect(400);
    expect(badTitle.body.error.code).toBe("invalid_title");

    const literalMarkup = await agent
      .post("/api/documents")
      .send({
        title: "Markup is text",
        content: simpleDocument("<script>alert(1)</script>"),
      })
      .expect(201);
    expect(JSON.stringify(literalMarkup.body.document.content)).toContain(
      "<script>alert(1)</script>",
    );
  });

  it("keeps user edits when the repeatable seed runs again", async () => {
    const { app, db } = makeApp();
    const agent = await signIn(app, "usr_alice");

    await agent
      .patch("/api/documents/doc_welcome")
      .send({
        content: simpleDocument("Alice edited the welcome document"),
        baseRevision: 1,
      })
      .expect(200);

    seedDatabase(db);

    const reopened = await agent.get("/api/documents/doc_welcome").expect(200);
    expect(reopened.body.document.revision).toBe(2);
    expect(JSON.stringify(reopened.body.document.content)).toContain(
      "Alice edited the welcome document",
    );
  });
});

describe("sharing and authorization", () => {
  it("lets an owner share and a recipient edit, while unrelated users get 404", async () => {
    const { app } = makeApp();
    const alice = await signIn(app, "usr_alice");
    const bob = await signIn(app, "usr_bob");
    const carol = await signIn(app, "usr_carol");

    const created = await alice
      .post("/api/documents")
      .send({ title: "Shared plan" })
      .expect(201);
    const documentId = created.body.document.id as string;

    const shared = await alice
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_bob" })
      .expect(200);
    expect(shared.body.shares).toHaveLength(1);
    expect(shared.body.shares[0].user.id).toBe("usr_bob");
    expect(shared.body.shares[0].role).toBe("editor");

    // Idempotent re-share.
    const sharedAgain = await alice
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_bob" })
      .expect(200);
    expect(sharedAgain.body.shares).toHaveLength(1);

    const bobList = await bob.get("/api/documents").expect(200);
    expect(bobList.body.owned.find((doc: { id: string }) => doc.id === documentId)).toBeUndefined();
    expect(bobList.body.shared.find((doc: { id: string }) => doc.id === documentId)).toMatchObject({
      title: "Shared plan",
      access: "shared",
    });

    const bobView = await bob.get(`/api/documents/${documentId}`).expect(200);
    expect(bobView.body.document).toMatchObject({
      access: "shared",
      canShare: false,
      canEdit: true,
    });
    expect(bobView.body.document.owner.id).toBe("usr_alice");

    const bobSave = await bob
      .patch(`/api/documents/${documentId}`)
      .send({
        title: "Shared plan, edited by Bob",
        content: simpleDocument("Bob can edit this shared document"),
        baseRevision: 1,
      })
      .expect(200);
    expect(bobSave.body.document.revision).toBe(2);

    const aliceView = await alice.get(`/api/documents/${documentId}`).expect(200);
    expect(aliceView.body.document.updatedBy.id).toBe("usr_bob");
    expect(JSON.stringify(aliceView.body.document.content)).toContain(
      "Bob can edit this shared document",
    );

    // A shared editor cannot change access.
    const bobShareAttempt = await bob
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_carol" })
      .expect(403);
    expect(bobShareAttempt.body.error.code).toBe("forbidden");
    await bob.get(`/api/documents/${documentId}/shares`).expect(403);

    // An unrelated user cannot read, edit, list, or share the document.
    await carol.get(`/api/documents/${documentId}`).expect(404);
    await carol
      .patch(`/api/documents/${documentId}`)
      .send({ content: simpleDocument("nope"), baseRevision: 1 })
      .expect(404);
    await carol
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_carol" })
      .expect(404);
    await carol.get(`/api/documents/${documentId}/shares`).expect(404);

    const carolList = await carol.get("/api/documents").expect(200);
    expect(carolList.body.owned.find((doc: { id: string }) => doc.id === documentId)).toBeUndefined();
    expect(carolList.body.shared.find((doc: { id: string }) => doc.id === documentId)).toBeUndefined();

    // Unrelated users also cannot guess Carol's private seeded document.
    await alice.get("/api/documents/doc_carol_private").expect(404);
    await bob.get("/api/documents/doc_carol_private").expect(404);

    // The owner can revoke access, after which the recipient loses access.
    const afterRevoke = await alice
      .delete(`/api/documents/${documentId}/shares/usr_bob`)
      .expect(200);
    expect(afterRevoke.body.shares).toHaveLength(0);
    await bob.get(`/api/documents/${documentId}`).expect(404);
  });

  it("validates share targets and prevents owners from removing themselves", async () => {
    const { app } = makeApp();
    const alice = await signIn(app, "usr_alice");
    const created = await alice
      .post("/api/documents")
      .send({ title: "Share validation" })
      .expect(201);
    const documentId = created.body.document.id as string;

    const selfShare = await alice
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_alice" })
      .expect(400);
    expect(selfShare.body.error.code).toBe("invalid_share");

    const unknownUser = await alice
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_nobody" })
      .expect(400);
    expect(unknownUser.body.error.code).toBe("unknown_user");

    const removeOwner = await alice
      .delete(`/api/documents/${documentId}/shares/usr_alice`)
      .expect(400);
    expect(removeOwner.body.error.code).toBe("invalid_share");
  });

  it("supports read-only viewer role and prevents viewer modifications", async () => {
    const { app } = makeApp();
    const alice = await signIn(app, "usr_alice");
    const bob = await signIn(app, "usr_bob");

    const created = await alice
      .post("/api/documents")
      .send({ title: "View-only document" })
      .expect(201);
    const documentId = created.body.document.id as string;

    // Alice shares with Bob as viewer
    const shared = await alice
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_bob", role: "viewer" })
      .expect(200);
    expect(shared.body.shares[0]).toMatchObject({
      role: "viewer",
      user: { id: "usr_bob" },
    });

    // Bob can read the document, sees canEdit = false
    const bobView = await bob.get(`/api/documents/${documentId}`).expect(200);
    expect(bobView.body.document).toMatchObject({
      canEdit: false,
      canShare: false,
      shareRole: "viewer",
      access: "shared",
    });

    // Bob cannot save modifications (403 Forbidden)
    const bobEdit = await bob
      .patch(`/api/documents/${documentId}`)
      .send({
        content: simpleDocument("Bob attempting unauthorized edit"),
        baseRevision: 1,
      })
      .expect(403);
    expect(bobEdit.body.error.code).toBe("forbidden");

    // Alice promotes Bob to editor
    const promoted = await alice
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_bob", role: "editor" })
      .expect(200);
    expect(promoted.body.shares[0].role).toBe("editor");

    // Bob can now edit and save
    const bobAllowedEdit = await bob
      .patch(`/api/documents/${documentId}`)
      .send({
        content: simpleDocument("Bob can now edit"),
        baseRevision: 1,
      })
      .expect(200);
    expect(bobAllowedEdit.body.document.revision).toBe(2);
  });

  it("filters documents by search query across titles and content", async () => {
    const { app } = makeApp();
    const alice = await signIn(app, "usr_alice");

    await alice
      .post("/api/documents")
      .send({ title: "Quarterly Roadmap", content: simpleDocument("Discussion of Q4 roadmap") })
      .expect(201);

    await alice
      .post("/api/documents")
      .send({ title: "Grocery List", content: simpleDocument("Apples, bananas, milk") })
      .expect(201);

    // Search by title
    const searchTitle = await alice.get("/api/documents?q=Roadmap").expect(200);
    expect(searchTitle.body.owned).toHaveLength(1);
    expect(searchTitle.body.owned[0].title).toBe("Quarterly Roadmap");

    // Search by content
    const searchContent = await alice.get("/api/documents?q=bananas").expect(200);
    expect(searchContent.body.owned).toHaveLength(1);
    expect(searchContent.body.owned[0].title).toBe("Grocery List");

    // Search with no matches
    const searchNone = await alice.get("/api/documents?q=nonexistent").expect(200);
    expect(searchNone.body.owned).toHaveLength(0);
  });
});

describe("text import", () => {
  it("imports a .txt file into a new document and rejects bad input clearly", async () => {
    const { app } = makeApp();
    const alice = await signIn(app, "usr_alice");

    const imported = await alice
      .post("/api/import")
      .send({ filename: "meeting-notes.txt", text: "Line one\n\nLine three" })
      .expect(201);

    expect(imported.body.document).toMatchObject({
      title: "meeting-notes",
      access: "owner",
      revision: 1,
    });
    expect(imported.body.document.content.content).toHaveLength(3);

    const originalCount = (await alice.get("/api/documents").expect(200)).body.owned
      .length as number;

    const unsupported = await alice
      .post("/api/import")
      .send({ filename: "notes.md", text: "# Heading" })
      .expect(400);
    expect(unsupported.body.error.code).toBe("unsupported_file_type");

    const empty = await alice
      .post("/api/import")
      .send({ filename: "empty.txt", text: "   \n\n" })
      .expect(400);
    expect(empty.body.error.code).toBe("empty_file");

    const oversized = await alice
      .post("/api/import")
      .send({ filename: "big.txt", text: "a".repeat(200 * 1024 + 1) })
      .expect(413);
    expect(oversized.body.error.code).toBe("import_too_large");

    const controlCharacters = await alice
      .post("/api/import")
      .send({ filename: "binary.txt", text: "hello\u0000world" })
      .expect(400);
    expect(controlCharacters.body.error.code).toBe("invalid_file");

    const afterCount = (await alice.get("/api/documents").expect(200)).body.owned
      .length as number;
    expect(afterCount).toBe(originalCount);

    const pathTitle = await alice
      .post("/api/import")
      .send({ filename: "../../Somewhere/path-title.txt", text: "Body" })
      .expect(201);
    expect(pathTitle.body.document.title).toBe("path-title");
  });
});

describe("persistence and request protections", () => {
  it("persists documents, shares, and sessions across a database restart", async () => {
    const directory = makeTempDirectory();
    const databasePath = path.join(directory, "folio.db");

    const first = makeApp({}, databasePath);
    const alice = await signIn(first.app, "usr_alice");
    const aliceCookie = await sessionCookie(first.app, "usr_alice");
    const bobCookie = await sessionCookie(first.app, "usr_bob");

    const created = await alice
      .post("/api/documents")
      .send({ title: "Survives restart" })
      .expect(201);
    const documentId = created.body.document.id as string;

    await alice
      .patch(`/api/documents/${documentId}`)
      .send({
        content: simpleDocument("Persisted content"),
        baseRevision: 1,
      })
      .expect(200);
    await alice
      .post(`/api/documents/${documentId}/shares`)
      .send({ userId: "usr_bob" })
      .expect(200);

    closeDb(first.db);

    const second = makeApp({}, databasePath);
    // makeApp re-runs the seed to prove it is idempotent against existing data.
    const reopened = await request(second.app)
      .get(`/api/documents/${documentId}`)
      .set("Cookie", aliceCookie)
      .expect(200);
    expect(reopened.body.document.title).toBe("Survives restart");
    expect(reopened.body.document.revision).toBe(2);
    expect(JSON.stringify(reopened.body.document.content)).toContain("Persisted content");

    const bobList = await request(second.app)
      .get("/api/documents")
      .set("Cookie", bobCookie)
      .expect(200);
    expect(
      bobList.body.shared.find((doc: { id: string }) => doc.id === documentId),
    ).toBeDefined();
    await request(second.app)
      .get(`/api/documents/${documentId}`)
      .set("Cookie", bobCookie)
      .expect(200);

    closeDb(second.db);
  });

  it("rejects cross-origin writes even with a valid session", async () => {
    const { app } = makeApp({ appOrigin: "https://folio.example.com" });
    const agent = await signIn(app, "usr_alice");

    const blocked = await agent
      .post("/api/documents")
      .set("Origin", "https://evil.example.com")
      .send({ title: "Cross origin" })
      .expect(403);
    expect(blocked.body.error.code).toBe("cross_origin_request");

    const blockedByFetchMetadata = await agent
      .post("/api/documents")
      .set("Sec-Fetch-Site", "cross-site")
      .send({ title: "Cross site" })
      .expect(403);
    expect(blockedByFetchMetadata.body.error.code).toBe("cross_origin_request");

    const allowed = await agent
      .post("/api/documents")
      .set("Origin", "https://folio.example.com")
      .send({ title: "Same origin" })
      .expect(201);
    expect(allowed.body.document.title).toBe("Same origin");
  });
});
