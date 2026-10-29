import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type AppDatabase = DatabaseSync;

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL,
        role_label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX sessions_user_idx ON sessions(user_id);
      CREATE INDEX sessions_expires_idx ON sessions(expires_at);

      CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content_json TEXT NOT NULL,
        plain_text TEXT NOT NULL DEFAULT '',
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL REFERENCES users(id)
      ) STRICT;

      CREATE INDEX documents_owner_idx ON documents(owner_id, updated_at DESC);

      CREATE TABLE document_shares (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (document_id, user_id)
      ) STRICT;

      CREATE INDEX document_shares_user_idx ON document_shares(user_id, created_at DESC);
    `,
  },
  {
    version: 2,
    name: "support viewer role in document_shares",
    sql: `
      CREATE TABLE IF NOT EXISTS document_shares_v2 (
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
        created_at TEXT NOT NULL,
        PRIMARY KEY (document_id, user_id)
      ) STRICT;

      INSERT OR IGNORE INTO document_shares_v2 (document_id, user_id, role, created_at)
        SELECT document_id, user_id, role, created_at FROM document_shares;

      DROP TABLE document_shares;
      ALTER TABLE document_shares_v2 RENAME TO document_shares;
      CREATE INDEX IF NOT EXISTS document_shares_user_idx ON document_shares(user_id, created_at DESC);
    `,
  },
];

function migrate(db: AppDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);

  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_migrations")
    .get() as { version: number | null } | undefined;
  const currentVersion = row?.version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        migration.version,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `Database migration ${migration.version} (${migration.name}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export function openDatabase(databasePath: string): AppDatabase {
  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }

  const db = new DatabaseSync(databasePath, { timeout: 5_000 });
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  if (databasePath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }
  migrate(db);
  return db;
}
