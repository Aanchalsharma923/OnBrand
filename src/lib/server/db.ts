import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/schema";

let client: ReturnType<typeof postgres> | undefined;
type Database = PostgresJsDatabase<typeof schema>;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (!client) client = postgres(url, { max: 4, prepare: false, connect_timeout: 5, idle_timeout: 20 });
  return drizzle(client, { schema });
}

export type ServerRole = "creator" | "reviewer" | "maintainer";

/**
 * Sets the PostgreSQL RLS scope inside the current transaction. Values must be
 * obtained from a verified server-side session and never from a request body.
 */
export async function withOrganizationScope<T>(
  scope: { organizationId: string; userId: string; role: ServerRole },
  action: (tx: Database) => Promise<T>,
) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${scope.organizationId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${scope.userId}, true)`);
    await tx.execute(sql`select set_config('app.role', ${scope.role}, true)`);
    return action(tx);
  });
}
