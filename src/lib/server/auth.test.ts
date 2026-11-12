import { describe, expect, it } from "vitest";
import { resolveTenantContext, requireRole, ForbiddenError, DEMO_ORGS } from "./auth";
import type { TenantContext } from "@/lib/types";

describe("Server-Side Auth & Tenant Context Resolution", () => {
  it("resolves default enterprise workspace (Alpha) when no headers provided", async () => {
    const req = new Request("http://localhost/api/reviews");
    const ctx = await resolveTenantContext(req);

    expect(ctx.organizationId).toBe(DEMO_ORGS.ALPHA.id);
    expect(ctx.role).toBe("reviewer");
    expect(ctx.actor?.displayName).toBe("Workspace Reviewer");
  });

  it("resolves isolated Nova Biopharma workspace when Beta header provided", async () => {
    const req = new Request("http://localhost/api/reviews", {
      headers: {
        "x-onbrand-tenant": "beta",
      },
    });
    const ctx = await resolveTenantContext(req);

    expect(ctx.organizationId).toBe(DEMO_ORGS.BETA.id);
    expect(ctx.role).toBe("reviewer");
    expect(ctx.actor?.displayName).toBe("Nova Biopharma (reviewer)");
  });

  it("enforces allowed roles using requireRole", () => {
    const creatorCtx: TenantContext = {
      organizationId: DEMO_ORGS.ALPHA.id,
      role: "creator",
      actor: { userId: "u1" },
    };

    // Creator should not be allowed to record reviewer decisions
    expect(() => requireRole(creatorCtx, ["reviewer", "maintainer"])).toThrow(ForbiddenError);

    // Creator is allowed creator operations
    expect(() => requireRole(creatorCtx, ["creator", "maintainer"])).not.toThrow();

    const reviewerCtx: TenantContext = {
      organizationId: DEMO_ORGS.ALPHA.id,
      role: "reviewer",
      actor: { userId: "u2" },
    };

    // Reviewer cannot register new knowledge sources (maintainer only)
    expect(() => requireRole(reviewerCtx, ["maintainer"])).toThrow(ForbiddenError);

    // Reviewer can review and decide
    expect(() => requireRole(reviewerCtx, ["reviewer", "maintainer"])).not.toThrow();
  });
});

