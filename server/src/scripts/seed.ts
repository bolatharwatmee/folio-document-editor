import dotenv from "dotenv";
import { loadConfig } from "../config.js";
import { openDatabase } from "../db.js";
import { seedDatabase } from "../seed.js";

dotenv.config({ quiet: true });

const config = loadConfig();
const db = openDatabase(config.databasePath);
seedDatabase(db);
console.log(`Demo users and sample documents are seeded in ${config.databasePath}`);
db.close();
