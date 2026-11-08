import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Pull the Vercel environment variables or set it locally before migrating.");
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(scriptDirectory, "../db/0001_initial.sql");
const migration = await readFile(migrationPath, "utf8");
const client = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10 });

try {
  await client.unsafe(migration);
  console.log("OnBrand database schema applied.");
} finally {
  await client.end({ timeout: 5 });
}
