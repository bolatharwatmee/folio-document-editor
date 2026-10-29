import dotenv from "dotenv";
import { loadConfig } from "../config.js";
import { openDatabase } from "../db.js";

dotenv.config({ quiet: true });

const config = loadConfig();
const db = openDatabase(config.databasePath);
console.log(`Database is migrated: ${config.databasePath}`);
db.close();
