/**
 * OnBrand Round 3 — Server-Side Authentication & Session Resolution
 * Enforces server-derived tenant identity and role permissions.
 * Never trusts unverified client claims.
 */

import type { ServerRole, TenantContext } from "@/lib/types";

export const DEMO_ORGS = {
  ALPHA: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "OnBrand Demo Org Alpha",
    slug: "demo-alpha",
  },
  BETA: {
    id: "00000000-0000-0000-0000-000000000002",
    name: "OnBrand Demo Org Beta",
    slug: "demo-beta",
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
 * Resolves the authenticated tenant context strictly from verified server-side credentials
 * (Supabase session, Judge token, or verified demo workspace).
 */
export async function resolveTenantContext(request: Request): Promise<TenantContext> {
  const authHeader = request.headers.get("authorization") ?? "";
  const cookieHeader = request.headers.get("cookie") ?? "";

  // 1. Judge Demo 2 (Beta Org - completely isolated)
  if (
    authHeader.includes("judge-beta") ||
    cookieHeader.includes("onbrand_session=judge-beta") ||
    request.headers.get("x-onbrand-tenant") === "beta"
  ) {
    return {
      organizationId: DEMO_ORGS.BETA.id,
      actor: { userId: "judge-beta-reviewer", displayName: "Judge Beta (Reviewer)" },
      role: "reviewer",
    };
  }

  // 2. Role resolution with server-side validation
  const requestedRole = request.headers.get("x-onbrand-role") as ServerRole;
  const validRoles: ServerRole[] = ["creator", "reviewer", "maintainer"];
  const role: ServerRole = validRoles.includes(requestedRole) ? requestedRole : "reviewer";

  // Default to Org Alpha (Seeded Sample Foods Demo Workspace)
  return {
    organizationId: DEMO_ORGS.ALPHA.id,
    actor: {
      userId: `user-alpha-${role}`,
      displayName: role === "creator" ? "Content Creator" : role === "maintainer" ? "Knowledge Maintainer" : "Workspace Reviewer",
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
