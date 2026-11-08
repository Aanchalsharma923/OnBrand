import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/schema";

let client: ReturnType<typeof postgres> | undefined;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (!client) client = postgres(url, { max: 4, prepare: false, connect_timeout: 5, idle_timeout: 20 });
  return drizzle(client, { schema });
}
