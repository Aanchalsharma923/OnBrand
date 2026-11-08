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
export type VerifiedActor = { userId: string; displayName: string };

export class OrganizationAccessError extends Error {
  constructor() {
    super("The signed-in user is not a member of this organization.");
    this.name = "OrganizationAccessError";
  }
}

/**
 * Sets the PostgreSQL RLS scope inside the current transaction. Values must be
 * obtained from a verified server-side session and never from a request body.
 */
export async function withOrganizationScope<T>(
  scope: { organizationId: string; actor: VerifiedActor },
  action: (tx: Database) => Promise<T>,
) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    // Establish organization visibility first, but use a fixed non-privileged
    // role while loading membership. Never accept the organization role from
    // request data or a caller-supplied JWT claim.
    await tx.execute(sql`select set_config('app.organization_id', ${scope.organizationId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${scope.actor.userId}, true)`);
    await tx.execute(sql`select set_config('app.role', 'none', true)`);
    const membership = await tx.execute(sql`
      select role, display_name from memberships
      where organization_id = ${scope.organizationId}::uuid
        and user_id = ${scope.actor.userId}
      limit 1
    `);
    const row = membership[0] as { role?: string; display_name?: string } | undefined;
    if (!row || !["creator", "reviewer", "maintainer"].includes(row.role ?? "")) throw new OrganizationAccessError();
    await tx.execute(sql`select set_config('app.role', ${row.role!}, true)`);
    return action(tx);
  });
}
