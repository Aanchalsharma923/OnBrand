import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/schema";

let client: ReturnType<typeof postgres> | undefined;
export type Database = PostgresJsDatabase<typeof schema>;
export type DBTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  if (!client) client = postgres(url, { max: 4, prepare: false, connect_timeout: 5, idle_timeout: 20 });
  return drizzle(client, { schema });
}

export type ServerRole = "creator" | "reviewer" | "maintainer" | "CREATOR" | "REVIEWER" | "MAINTAINER";
export type VerifiedActor = { userId: string; displayName?: string };

export interface TenantContext {
  organizationId: string;
  userId?: string;
  role: "CREATOR" | "REVIEWER" | "MAINTAINER" | "creator" | "reviewer" | "maintainer";
  actor?: VerifiedActor;
}

export class OrganizationAccessError extends Error {
  constructor() {
    super("The signed-in user is not a member of this organization.");
    this.name = "OrganizationAccessError";
  }
}

/**
 * Sets the PostgreSQL RLS scope inside the current transaction. Values must be
 * obtained from a verified server-side session and never from a request body.
 * Enforces Invariant 3: SET LOCAL app.organization_id and SET LOCAL app.role.
 */
export async function withOrganizationScope<T>(
  ctxOrScope: TenantContext | { organizationId: string; actor: VerifiedActor },
  action: (tx: any) => Promise<T>,
): Promise<T> {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const isTenantContext = "role" in ctxOrScope && Boolean(ctxOrScope.role);

    if (isTenantContext) {
      const ctx = ctxOrScope as TenantContext;
      const normalizedRole = ctx.role.toLowerCase();
      if (!["creator", "reviewer", "maintainer"].includes(normalizedRole)) {
        throw new OrganizationAccessError();
      }

      const cleanOrgId = ctx.organizationId.replace(/'/g, "''");
      const cleanRole = normalizedRole.replace(/'/g, "''");
      const cleanUserId = (ctx.userId ?? "").replace(/'/g, "''");

      // Enforce RLS at PostgreSQL engine level via SET LOCAL transaction variables (Invariant 3)
      await tx.execute(sql.raw(`SET LOCAL app.organization_id = '${cleanOrgId}';`));
      await tx.execute(sql.raw(`SET LOCAL app.role = '${cleanRole}';`));
      if (cleanUserId) {
        await tx.execute(sql.raw(`SET LOCAL app.user_id = '${cleanUserId}';`));
      }

      await tx.execute(sql`select set_config('app.organization_id', ${ctx.organizationId}, true)`);
      await tx.execute(sql`select set_config('app.role', ${normalizedRole}, true)`);
      if (ctx.userId) {
        await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true)`);
      }

      return action(tx);
    } else {
      const scope = ctxOrScope as { organizationId: string; actor: VerifiedActor };
      const cleanOrgId = scope.organizationId.replace(/'/g, "''");
      const cleanUserId = scope.actor.userId.replace(/'/g, "''");

      await tx.execute(sql.raw(`SET LOCAL app.organization_id = '${cleanOrgId}';`));
      await tx.execute(sql.raw(`SET LOCAL app.user_id = '${cleanUserId}';`));
      await tx.execute(sql.raw(`SET LOCAL app.role = 'none';`));

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
      const memberRole = row?.role?.toLowerCase();
      if (!memberRole || !["creator", "reviewer", "maintainer"].includes(memberRole)) {
        throw new OrganizationAccessError();
      }

      const cleanRole = memberRole.replace(/'/g, "''");
      await tx.execute(sql.raw(`SET LOCAL app.role = '${cleanRole}';`));
      await tx.execute(sql`select set_config('app.role', ${memberRole}, true)`);

      return action(tx);
    }
  });
}
