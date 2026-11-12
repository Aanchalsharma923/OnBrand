/**
 * OnBrand — Supabase Server Client & Auth Resolution
 * Provides verified server-side Supabase client and session extraction.
 * Service-role keys and database credentials are kept strictly server-side.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { databaseConfigured, getDatabase } from "./db";
import * as schema from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import type { ServerRole, VerifiedActor } from "@/lib/types";

let supabaseAdminClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or API keys.");
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdminClient;
}

/**
 * Extracts a Bearer token or Supabase session cookie from an incoming HTTP Request.
 */
export function extractAuthToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      const [name, ...val] = cookie.split("=");
      const trimmedName = name.trim();
      if (
        trimmedName === "sb-access-token" ||
        trimmedName.startsWith("sb-") && trimmedName.endsWith("-auth-token")
      ) {
        const value = decodeURIComponent(val.join("=").trim());
        try {
          // If stored as JSON string array [accessToken, refreshToken]
          if (value.startsWith("[")) {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed) && parsed[0]) return parsed[0];
          }
          return value;
        } catch {
          return value;
        }
      }
    }
  }

  return null;
}

export interface VerifiedMembership {
  organizationId: string;
  role: ServerRole;
  actor: VerifiedActor;
}

/**
 * Resolves trusted user organization membership and server role from the database.
 * Client-controlled role claims are never trusted.
 */
export async function resolveUserMembershipFromDb(
  userId: string,
  requestedOrgId?: string
): Promise<VerifiedMembership | null> {
  if (!databaseConfigured()) return null;

  try {
    const db = getDatabase();
    const query = requestedOrgId
      ? and(eq(schema.memberships.userId, userId), eq(schema.memberships.organizationId, requestedOrgId))
      : eq(schema.memberships.userId, userId);

    const rows = await db
      .select({
        organizationId: schema.memberships.organizationId,
        role: schema.memberships.role,
        displayName: schema.memberships.displayName,
      })
      .from(schema.memberships)
      .where(query)
      .limit(1);

    if (!rows.length) return null;

    const row = rows[0];
    const rawRole = (row.role ?? "reviewer").toLowerCase();
    const role: ServerRole = ["creator", "reviewer", "maintainer"].includes(rawRole)
      ? (rawRole as ServerRole)
      : "reviewer";

    return {
      organizationId: row.organizationId,
      role,
      actor: {
        userId,
        displayName: row.displayName || `User (${role})`,
      },
    };
  } catch (err) {
    console.error("Failed to query membership from PostgreSQL:", err);
    return null;
  }
}
