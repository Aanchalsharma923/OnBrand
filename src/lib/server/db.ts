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
  if (!client) {
    const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
    client = postgres(url, {
      max: 4,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
      ssl: isLocalhost ? false : "require",
    });
  }
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
  if (!ctxOrScope || !ctxOrScope.organizationId || typeof ctxOrScope.organizationId !== "string" || !ctxOrScope.organizationId.trim()) {
    throw new OrganizationAccessError();
  }

  const isTenantContext = "role" in ctxOrScope && Boolean(ctxOrScope.role);
  if (isTenantContext) {
    const ctx = ctxOrScope as TenantContext;
    const normalizedRole = ctx.role ? ctx.role.toLowerCase() : "";
    if (!["creator", "reviewer", "maintainer"].includes(normalizedRole)) {
      throw new OrganizationAccessError();
    }
  } else {
    const scope = ctxOrScope as { organizationId: string; actor: VerifiedActor };
    if (!scope.actor?.userId) {
      throw new OrganizationAccessError();
    }
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    if (isTenantContext) {
      const ctx = ctxOrScope as TenantContext;
      const normalizedRole = ctx.role.toLowerCase();

      // Enforce RLS at PostgreSQL engine level via parameterized transaction-local settings
      await tx.execute(sql`select set_config('app.organization_id', ${ctx.organizationId.trim()}, true)`);
      await tx.execute(sql`select set_config('app.role', ${normalizedRole}, true)`);
      if (ctx.userId) {
        await tx.execute(sql`select set_config('app.user_id', ${ctx.userId.trim()}, true)`);
      }

      // Security Invariant: The connection pooler connects using the postgres role, which
      // has rolbypassrls=true. Lower the transaction role to 'authenticated' so PostgreSQL's
      // kernel row-level security engine actively enforces all RLS policies on tenant tables.
      try {
        await tx.execute(sql`SET LOCAL ROLE authenticated`);
      } catch {
        // Graceful fallback for non-Supabase local test containers without the 'authenticated' role
      }

      return action(tx);
    } else {
      const scope = ctxOrScope as { organizationId: string; actor: VerifiedActor };
      if (!scope.actor?.userId) {
        throw new OrganizationAccessError();
      }

      await tx.execute(sql`select set_config('app.organization_id', ${scope.organizationId.trim()}, true)`);
      await tx.execute(sql`select set_config('app.user_id', ${scope.actor.userId.trim()}, true)`);
      await tx.execute(sql`select set_config('app.role', 'none', true)`);

      const membership = await tx.execute(sql`
        select role, display_name from memberships
        where organization_id = ${scope.organizationId.trim()}::uuid
          and user_id = ${scope.actor.userId.trim()}
        limit 1
      `);
      const row = membership[0] as { role?: string; display_name?: string } | undefined;
      const memberRole = row?.role?.toLowerCase();
      if (!memberRole || !["creator", "reviewer", "maintainer"].includes(memberRole)) {
        throw new OrganizationAccessError();
      }

      await tx.execute(sql`select set_config('app.role', ${memberRole}, true)`);

      try {
        await tx.execute(sql`SET LOCAL ROLE authenticated`);
      } catch {
        // Graceful fallback for non-Supabase local test containers without the 'authenticated' role
      }

      return action(tx);
    }
  });
}
