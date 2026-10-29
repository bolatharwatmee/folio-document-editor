import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { seedDatabase } from "./seed.js";

dotenv.config({ quiet: true });

const config = loadConfig();
const db = openDatabase(config.databasePath);
seedDatabase(db);

const candidateStaticDir = path.resolve("dist/client");
const staticDir = fs.existsSync(candidateStaticDir) ? candidateStaticDir : undefined;
const app = createApp({ db, config, staticDir });

const server = app.listen(config.port, () => {
  console.log(`Folio is listening on http://localhost:${config.port}`);
  console.log(
    staticDir
      ? `Serving the built frontend from ${staticDir}`
      : "No built frontend found; run the Vite dev server for the UI.",
  );
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing the server.`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
