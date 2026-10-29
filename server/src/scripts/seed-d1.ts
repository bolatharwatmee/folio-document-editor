import fs from "node:fs";
import { openDatabase } from "../db.js";
import { seedDatabase } from "../seed.js";

const db = openDatabase(":memory:");
seedDatabase(db);

const docs = db.prepare("SELECT * FROM documents").all() as any[];
const shares = db.prepare("SELECT * FROM document_shares").all() as any[];

let sql = "";
for (const doc of docs) {
  const escapedContent = doc.content_json.replace(/'/g, "''");
  const escapedPlain = doc.plain_text.replace(/'/g, "''");
  const escapedTitle = doc.title.replace(/'/g, "''");
  sql += `INSERT INTO documents (id, title, content_json, plain_text, owner_id, revision, created_at, updated_at, updated_by) VALUES ('${doc.id}', '${escapedTitle}', '${escapedContent}', '${escapedPlain}', '${doc.owner_id}', ${doc.revision}, '${doc.created_at}', '${doc.updated_at}', '${doc.updated_by}') ON CONFLICT(id) DO NOTHING;\n`;
}
for (const share of shares) {
  sql += `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES ('${share.document_id}', '${share.user_id}', '${share.role}', '${share.created_at}') ON CONFLICT(document_id, user_id) DO NOTHING;\n`;
}

fs.writeFileSync("./data/seed-d1.sql", sql);
console.log("Generated seed-d1.sql with length:", sql.length);
