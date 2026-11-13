/**
 * OnBrand — Server-Side Authentication & Session Resolution
 * Enforces server-derived tenant identity and role permissions via Supabase Auth & PostgreSQL.
 * Never trusts unverified client claims for production organizations.
 */

import type { ServerRole, TenantContext } from "@/lib/types";
import { databaseConfigured } from "./db";
import {
  isSupabaseAuthConfigured,
  getSupabaseAuthClient,
  extractAuthToken,
  resolveUserMembershipFromDb,
  SupabaseConfigurationError,
} from "./supabase";

export const DEMO_ORGS = {
  ALPHA: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "OnBrand Enterprise · Acme Foods",
    slug: "acme-foods",
  },
  BETA: {
    id: "00000000-0000-0000-0000-000000000002",
    name: "OnBrand Enterprise · Nova Biopharma",
    slug: "nova-biopharma",
  },
};

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Insufficient permissions for this operation.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Resolves the cryptographically verified user identity from Supabase Auth session token.
 * Does not require an existing organization membership. Used for onboarding and organization creation.
 */
export async function resolveAuthenticatedUser(request: Request): Promise<{ id: string; email?: string; metadata?: any }> {
  const token = extractAuthToken(request);
  if (!token) {
    throw new UnauthorizedError("Authentication required. Please sign in.");
  }

  if (!isSupabaseAuthConfigured()) {
    throw new SupabaseConfigurationError(
      "Supabase Authentication is not configured on the server. Unable to verify user session credentials."
    );
  }

  const supabase = getSupabaseAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new UnauthorizedError(`Invalid or expired session: ${error?.message || "User not found"}`);
  }

  return {
    id: user.id,
    email: user.email,
    metadata: user.user_metadata,
  };
}

/**
 * Resolves the authenticated tenant context strictly from verified server-side credentials
 * (Supabase Auth session + database-backed memberships) or authenticated sandbox workspaces.
 * Client-controlled role claims are never trusted for production organizations.
 */
export async function resolveTenantContext(request: Request): Promise<TenantContext> {
  const token = extractAuthToken(request);

  // 1. Verified Supabase Session Resolution
  // When an authorization token or session cookie is provided, verify it strictly.
  // Missing server configuration produces an explicit SupabaseConfigurationError (HTTP 503),
  // NEVER a silent degrade to demo mode.
  if (token) {
    if (!isSupabaseAuthConfigured()) {
      throw new SupabaseConfigurationError(
        "Supabase Authentication is not configured on the server. Unable to verify user session credentials."
      );
    }

    try {
      const supabase = getSupabaseAuthClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        throw new UnauthorizedError(`Invalid or expired session: ${error?.message || "User not found"}`);
      }

      const requestedOrgId = request.headers.get("x-onbrand-tenant") || undefined;
      const verified = await resolveUserMembershipFromDb(user.id, requestedOrgId);

      if (verified) {
        return {
          organizationId: verified.organizationId,
          userId: user.id,
          actor: verified.actor,
          role: verified.role,
        };
      }

      // If user explicitly requested an organization that they do NOT have membership in:
      if (requestedOrgId) {
        throw new ForbiddenError("You are not an authorized member of the requested organization.");
      }

      // When database is configured in production, fail closed: do NOT silently assign
      // arbitrary authenticated users to a production organization without verified membership.
      if (databaseConfigured()) {
        throw new ForbiddenError("You are not an authorized member of any organization.");
      }

      // Authenticated user with no explicit membership record yet (offline/sandbox test mode only):
      return {
        organizationId: DEMO_ORGS.ALPHA.id,
        userId: user.id,
        actor: {
          userId: user.id,
          displayName: user.email || (user.user_metadata?.full_name as string) || "Enterprise Member",
        },
        role: "reviewer",
      };
    } catch (err) {
      if (err instanceof UnauthorizedError || err instanceof ForbiddenError || err instanceof SupabaseConfigurationError) {
        throw err;
      }
      console.error("Supabase session verification failed:", err);
      throw new UnauthorizedError("Could not verify session credentials.");
    }
  }

  // 2. Unauthenticated Request Inspection
  const tenantHeader = request.headers.get("x-onbrand-tenant") || request.headers.get("x-demo-org") || "";
  const isBeta =
    tenantHeader === "beta" ||
    tenantHeader === "org_beta" ||
    tenantHeader === DEMO_ORGS.BETA.id;
  const isAlpha =
    tenantHeader === "alpha" ||
    tenantHeader === "org_alpha" ||
    tenantHeader === DEMO_ORGS.ALPHA.id ||
    !tenantHeader;

  // In production or when strict authentication is required, unauthenticated requests fail closed
  if (process.env.NODE_ENV === "production" || process.env.STRICT_AUTH === "true") {
    throw new UnauthorizedError("Authentication required. Please sign in to access this organization.");
  }

  // When database is configured in production, reject unauthenticated access to non-demo tenants
  if (databaseConfigured() && !isBeta && !isAlpha) {
    throw new UnauthorizedError("Authentication required. Please sign in to access this organization.");
  }

  // 3. Isolated Workspace Beta (Nova Biopharma)
  if (isBeta) {
    const rawRole = (request.headers.get("x-onbrand-role") || request.headers.get("x-demo-role") || "reviewer").toLowerCase() as ServerRole;
    const role: ServerRole = ["creator", "reviewer", "maintainer"].includes(rawRole) ? rawRole : "reviewer";
    return {
      organizationId: DEMO_ORGS.BETA.id,
      userId: `user-beta-${role}`,
      actor: { userId: `user-beta-${role}`, displayName: `Nova Biopharma (${role})` },
      role,
    };
  }

  // 4. Default Enterprise Workspace Alpha (Acme Foods) or Specified Custom Tenant
  const rawRole = (request.headers.get("x-onbrand-role") || request.headers.get("x-demo-role") || "reviewer").toLowerCase() as ServerRole;
  const validRoles: ServerRole[] = ["creator", "reviewer", "maintainer"];
  const role: ServerRole = validRoles.includes(rawRole) ? rawRole : "reviewer";

  const targetOrgId = tenantHeader && tenantHeader !== "alpha" && tenantHeader !== "org_alpha"
    ? tenantHeader
    : DEMO_ORGS.ALPHA.id;

  return {
    organizationId: targetOrgId,
    userId: `user-${targetOrgId.slice(0, 8)}-${role}`,
    actor: {
      userId: `user-${targetOrgId.slice(0, 8)}-${role}`,
      displayName:
        role === "creator"
          ? "Content Creator"
          : role === "maintainer"
          ? "Knowledge Maintainer"
          : "Workspace Reviewer",
    },
    role,
  };
}

/**
 * Asserts that the authenticated actor has one of the allowed roles.
 */
export function requireRole(ctx: TenantContext, allowedRoles: ServerRole[]) {
  if (!ctx.role || !allowedRoles.includes(ctx.role)) {
    throw new ForbiddenError(
      `Role '${ctx.role ?? "none"}' is not authorized. Required: ${allowedRoles.join(" or ")}.`,
    );
  }
}
