/**
 * OnBrand — Supabase Server Client & Auth Resolution
 *
 * Provides a verified server-side Supabase admin client and session extraction.
 *
 * Key invariants enforced here:
 *  1. The admin client is initialised with SUPABASE_SERVICE_ROLE_KEY only.
 *     It NEVER falls back to a public/publishable key for privileged operations.
 *     The service-role key bypasses all Postgres RLS policies; using a public
 *     key in its place would silently produce unauthenticated admin calls that
 *     Supabase would reject or return empty data for.
 *  2. JWT validation is performed by calling supabase.auth.getUser(token) with
 *     the user's access token (a JWT issued by Supabase Auth after sign-in).
 *     This is NOT the same as the API key — mixing them up is a security defect.
 *  3. Missing required server credentials produce an explicit ConfigurationError
 *     at startup, not a silent fall-through to demo mode.
 *  4. Database credentials (DATABASE_URL) remain in db.ts and are never exposed
 *     here or through any NEXT_PUBLIC variable.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { databaseConfigured, getDatabase } from "./db";
import * as schema from "@/lib/schema";
import { eq, and } from "drizzle-orm";
import type { ServerRole, VerifiedActor } from "@/lib/types";

let supabaseAdminClient: SupabaseClient | null = null;
let supabaseAuthClient: SupabaseClient | null = null;

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

/**
 * Thrown at request time when a required server-side Supabase credential is
 * absent from the environment. Distinct from UnauthorizedError (which signals
 * a user authentication failure) so callers can respond with 503 vs 401.
 */
export class SupabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigurationError";
  }
}

/**
 * Returns true when Supabase is configured for user authentication and JWT verification.
 * User JWT verification requires NEXT_PUBLIC_SUPABASE_URL and a valid key
 * (either NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * or SUPABASE_SERVICE_ROLE_KEY).
 */
export function isSupabaseAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

/**
 * Returns true when both the Supabase URL and the service-role key are set.
 * Required for administrative operations that bypass Row Level Security.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Returns a Supabase client suitable for verifying user access tokens (JWTs)
 * via supabase.auth.getUser(userAccessToken).
 *
 * Does NOT require the service-role key; the publishable key or anon key is
 * fully sufficient because Supabase Auth validates the user's JWT cryptographically
 * on the Auth server against the project's JWT secret.
 */
export function getSupabaseAuthClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) {
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local."
    );
  }

  if (!key) {
    throw new SupabaseConfigurationError(
      "Supabase key is not configured. Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  if (!supabaseAuthClient) {
    supabaseAuthClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAuthClient;
}

/**
 * Returns the server admin Supabase client, initialised with SUPABASE_SERVICE_ROLE_KEY.
 *
 * Throws SupabaseConfigurationError when either required variable is absent.
 * NEVER falls back to a public/publishable key: doing so would silently
 * downgrade an admin client to a user-scoped client, breaking RLS bypass and
 * returning incorrect data without any error.
 */
export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL is not set. " +
        "Add it to .env.local (and to your deployment environment secrets)."
    );
  }

  if (!serviceRoleKey) {
    throw new SupabaseConfigurationError(
      "SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "Add it to .env.local as a server-only secret. " +
        "NEVER prefix this variable with NEXT_PUBLIC_ — doing so would " +
        "expose it in every browser bundle and bypass all RLS policies."
    );
  }

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdminClient;
}

// ---------------------------------------------------------------------------
// Token / session extraction
// ---------------------------------------------------------------------------

/**
 * Extracts a user's JWT access token from an incoming HTTP Request.
 *
 * The access token is issued by Supabase Auth after a successful sign-in and
 * is structurally a JWT (eyJ...). It is NOT the same as a Supabase API key
 * (sb_publishable_* / sb-anon-* / service_role). The distinction matters:
 *   - API keys authenticate the application to the Supabase project.
 *   - User access tokens authenticate an individual user's session.
 * Only the user access token should be passed to supabase.auth.getUser().
 *
 * Checks in order:
 *  1. Authorization: Bearer <token> header
 *  2. sb-access-token cookie
 *  3. sb-<projectref>-auth-token cookie (Supabase JS SDK default)
 */
export function extractAuthToken(request: Request): string | null {
  let token: string | null = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").map((c) => c.trim());
      for (const cookie of cookies) {
        const [name, ...val] = cookie.split("=");
        const trimmedName = name.trim();
        if (
          trimmedName === "sb-access-token" ||
          (trimmedName.startsWith("sb-") && trimmedName.endsWith("-auth-token"))
        ) {
          const value = decodeURIComponent(val.join("=").trim());
          try {
            // Supabase JS SDK may store session as JSON array [accessToken, refreshToken]
            if (value.startsWith("[")) {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed) && parsed[0]) {
                token = parsed[0];
                break;
              }
            }
            token = value;
            break;
          } catch {
            token = value;
            break;
          }
        }
      }
    }
  }

  if (!token) return null;

  // Security Invariant: Never treat an API key as a user access token.
  // API keys (publishable, anon, service-role) authenticate applications,
  // not individual user sessions. User access tokens are signed JWTs issued on login.
  if (
    token.startsWith("sb_publishable_") ||
    token === process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    token === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    token === process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  return token;
}

// ---------------------------------------------------------------------------
// Membership resolution
// ---------------------------------------------------------------------------

export interface VerifiedMembership {
  organizationId: string;
  role: ServerRole;
  actor: VerifiedActor;
}

/**
 * Resolves trusted user organization membership and server role from the database.
 * Client-controlled role claims (x-onbrand-role headers) are never trusted here.
 */
export async function resolveUserMembershipFromDb(
  userId: string,
  requestedOrgId?: string
): Promise<VerifiedMembership | null> {
  if (!databaseConfigured()) return null;

  try {
    const db = getDatabase();
    const query = requestedOrgId
      ? and(
          eq(schema.memberships.userId, userId),
          eq(schema.memberships.organizationId, requestedOrgId)
        )
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
    const role: ServerRole = ["creator", "reviewer", "maintainer"].includes(
      rawRole
    )
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

/** Exposed for testing only. Resets the singletons so tests can re-initialise. */
export function _resetAdminClientForTests(): void {
  supabaseAdminClient = null;
  supabaseAuthClient = null;
}
