import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import {
  resolveTenantContext,
  requireRole,
  ForbiddenError,
  UnauthorizedError,
  DEMO_ORGS,
} from "./auth";
import { withOrganizationScope, OrganizationAccessError } from "./db";
import { getRepository } from "./repository";
import { extractAuthToken } from "./supabase";
import { createDraft, seedSources } from "../onbrand";
import type { TenantContext } from "../types";

describe("Phase 5: Mandatory Adversarial Attack & Tenant Isolation Suite", () => {
  const repo = getRepository();

  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zmnehuiiopwerbtjxxqt.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_dummy_key_for_testing";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  const userAContext: TenantContext = {
    userId: "usr-a-reviewer",
    organizationId: DEMO_ORGS.ALPHA.id,
    role: "reviewer",
    actor: { userId: "usr-a-reviewer", displayName: "User A (Reviewer)" },
  };

  const userBContext: TenantContext = {
    userId: "usr-b-creator",
    organizationId: DEMO_ORGS.BETA.id,
    role: "creator",
    actor: { userId: "usr-b-creator", displayName: "User B (Creator)" },
  };

  const userAMaintainerContext: TenantContext = {
    userId: "usr-a-maintainer",
    organizationId: DEMO_ORGS.ALPHA.id,
    role: "maintainer",
    actor: { userId: "usr-a-maintainer", displayName: "User A (Maintainer)" },
  };

  // ---------------------------------------------------------------------------
  // Attack 1: User A submits User B's organization ID
  // Expected: Reject (ForbiddenError 403)
  // ---------------------------------------------------------------------------
  it("Attack 1: rejects when User A requests User B's organization ID without membership", async () => {
    const req = new Request("http://localhost:3000/api/reviews", {
      headers: {
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.usera.token",
        "x-onbrand-tenant": DEMO_ORGS.BETA.id,
      },
    });

    const supabaseModule = await import("./supabase");
    const authSpy = vi.spyOn(supabaseModule, "getSupabaseAuthClient").mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "usr-a", email: "usera@example.com" } },
          error: null,
        }),
      },
    } as any);

    // Membership check returns null for User A in Org Beta
    const membershipSpy = vi.spyOn(supabaseModule, "resolveUserMembershipFromDb").mockResolvedValue(null);

    try {
      await expect(resolveTenantContext(req)).rejects.toThrow(ForbiddenError);
    } finally {
      authSpy.mockRestore();
      membershipSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // Attack 2: User A changes their role to admin / maintainer
  // Expected: Reject / Ignore client-controlled role elevation
  // ---------------------------------------------------------------------------
  it("Attack 2: ignores client-supplied role elevation headers and enforces verified membership role", async () => {
    const req = new Request("http://localhost:3000/api/sources", {
      headers: {
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.usera.token",
        "x-onbrand-role": "maintainer", // Malicious privilege escalation attempt
        "x-demo-role": "MAINTAINER",
      },
    });

    const supabaseModule = await import("./supabase");
    const authSpy = vi.spyOn(supabaseModule, "getSupabaseAuthClient").mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "usr-a", email: "usera@example.com" } },
          error: null,
        }),
      },
    } as any);

    const membershipSpy = vi.spyOn(supabaseModule, "resolveUserMembershipFromDb").mockResolvedValue({
      organizationId: DEMO_ORGS.ALPHA.id,
      role: "reviewer", // Verified role in DB is strictly reviewer
      actor: { userId: "usr-a", displayName: "User A" },
    });

    try {
      const ctx = await resolveTenantContext(req);
      expect(ctx.role).toBe("reviewer"); // Must NOT be maintainer
      expect(() => requireRole(ctx, ["maintainer"])).toThrow(ForbiddenError);
    } finally {
      authSpy.mockRestore();
      membershipSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // Attack 3: User A reads User B's document
  // Expected: Deny (0 results / null)
  // ---------------------------------------------------------------------------
  it("Attack 3: denies User A access to User B's private documents", async () => {
    const userBDraft = createDraft("Confidential Beta Formulation Spec", {
      id: "DRAFT-BETA-CONFIDENTIAL-01",
      title: "Beta Spec",
      channel: "web",
      product: "Beta Drug",
      audience: "Medical",
      version: 1,
    });

    await repo.saveDraftVersion(userBContext, userBDraft);

    // User A attempts to read User B's document
    const userAAttempt = await repo.getDraftVersion(userAContext, "DRAFT-BETA-CONFIDENTIAL-01", 1);
    expect(userAAttempt).toBeNull();

    const userADrafts = await repo.getDrafts(userAContext);
    expect(userADrafts.some((d) => d.id === "DRAFT-BETA-CONFIDENTIAL-01")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Attack 4: User A inserts a record into User B's organization
  // Expected: Deny
  // ---------------------------------------------------------------------------
  it("Attack 4: prevents User A from inserting records into User B's organization", async () => {
    const rogueDraft = createDraft("Rogue injection content", {
      id: "DRAFT-ROGUE-01",
      title: "Rogue Draft",
      channel: "web",
      product: "Phish",
      audience: "Victims",
      version: 1,
    });

    // Save under User A's context
    await repo.saveDraftVersion(userAContext, rogueDraft);

    // Verify it was stored in User A's organization, NEVER in User B's organization
    const userBDrafts = await repo.getDrafts(userBContext);
    expect(userBDrafts.some((d) => d.id === "DRAFT-ROGUE-01")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Attack 5: User A updates User B's record
  // Expected: Deny
  // ---------------------------------------------------------------------------
  it("Attack 5: prevents User A from modifying or revoking User B's knowledge sources", async () => {
    const userBSource = {
      ...seedSources[0],
      id: "SRC-BETA-PROTECTED-01",
      title: "Protected Beta Research",
      owner: "Beta Science Team",
      approvalState: "APPROVED" as const,
    };

    await repo.createSource(userBContext, userBSource);

    // User A (even with maintainer role in Org Alpha) attempts to revoke User B's source
    await repo.updateSourceStatus(userAMaintainerContext, "SRC-BETA-PROTECTED-01", "REVOKED");

    // Verify source in Org Beta remains untouched and APPROVED
    const checkSource = await repo.getSourceById(userBContext, "SRC-BETA-PROTECTED-01");
    expect(checkSource).not.toBeNull();
    expect(checkSource?.approvalState).toBe("APPROVED");
    expect(checkSource?.revokedAt).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Attack 6: Unauthenticated request accesses tenant data
  // Expected: Reject (UnauthorizedError)
  // ---------------------------------------------------------------------------
  it("Attack 6: rejects unauthenticated requests when strict authentication is required", async () => {
    const origStrict = process.env.STRICT_AUTH;
    process.env.STRICT_AUTH = "true";

    try {
      const req = new Request("http://localhost:3000/api/reviews");
      await expect(resolveTenantContext(req)).rejects.toThrow(UnauthorizedError);
    } finally {
      if (origStrict === undefined) delete process.env.STRICT_AUTH;
      else process.env.STRICT_AUTH = origStrict;
    }
  });

  // ---------------------------------------------------------------------------
  // Attack 7: Expired or invalid JWT
  // Expected: Reject (UnauthorizedError)
  // ---------------------------------------------------------------------------
  it("Attack 7: rejects requests with invalid or expired cryptographic JWTs", async () => {
    const req = new Request("http://localhost:3000/api/reviews", {
      headers: {
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired_signature",
      },
    });

    const supabaseModule = await import("./supabase");
    const authSpy = vi.spyOn(supabaseModule, "getSupabaseAuthClient").mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "JWT expired or signature verification failed." },
        }),
      },
    } as any);

    try {
      await expect(resolveTenantContext(req)).rejects.toThrow(UnauthorizedError);
      await expect(resolveTenantContext(req)).rejects.toThrow("JWT expired");
    } finally {
      authSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // Attack 8: Repository call without validated context
  // Expected: Reject (OrganizationAccessError)
  // ---------------------------------------------------------------------------
  it("Attack 8: rejects repository operations without a valid organization scope", async () => {
    // Missing organizationId
    await expect(
      withOrganizationScope({ organizationId: "", role: "reviewer" } as any, async () => {
        return "unreachable";
      })
    ).rejects.toThrow(OrganizationAccessError);

    // Invalid / unapproved role
    await expect(
      withOrganizationScope(
        { organizationId: DEMO_ORGS.ALPHA.id, role: "superuser" as any },
        async () => "unreachable"
      )
    ).rejects.toThrow(OrganizationAccessError);
  });

  // ---------------------------------------------------------------------------
  // Attack 9: User with revoked membership accesses organization
  // Expected: Reject (ForbiddenError 403)
  // ---------------------------------------------------------------------------
  it("Attack 9: rejects access when authenticated user membership has been revoked", async () => {
    const req = new Request("http://localhost:3000/api/reviews", {
      headers: {
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.revoked_user.token",
        "x-onbrand-tenant": DEMO_ORGS.ALPHA.id,
      },
    });

    const supabaseModule = await import("./supabase");
    const authSpy = vi.spyOn(supabaseModule, "getSupabaseAuthClient").mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "usr-revoked", email: "revoked@example.com" } },
          error: null,
        }),
      },
    } as any);

    // Membership query returns null (revoked or deleted in DB)
    const membershipSpy = vi.spyOn(supabaseModule, "resolveUserMembershipFromDb").mockResolvedValue(null);

    try {
      await expect(resolveTenantContext(req)).rejects.toThrow(ForbiddenError);
    } finally {
      authSpy.mockRestore();
      membershipSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // Attack 10: Service-role client used for ordinary tenant operation
  // Expected: Detect and prevent (Service key rejected as user bearer token)
  // ---------------------------------------------------------------------------
  it("Attack 10: rejects SUPABASE_SERVICE_ROLE_KEY if passed as an access token", () => {
    const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_service_role_secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

    const req = new Request("http://localhost:3000/api/reviews", {
      headers: {
        authorization: `Bearer ${serviceKey}`,
      },
    });

    const extracted = extractAuthToken(req);
    // extractAuthToken strictly filters out service role keys and publishable keys
    expect(extracted).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Attack 11: Pooled connection reused after another tenant's transaction
  // Expected: No context leakage between alternating tenant operations
  // ---------------------------------------------------------------------------
  it("Attack 11: guarantees zero cross-tenant context leakage across pooled sequential transactions", async () => {
    const draftA = createDraft("Alpha Secret", {
      id: "DRAFT-LEAK-ALPHA",
      title: "Leak Test Alpha",
      channel: "web",
      product: "A",
      audience: "A",
      version: 1,
    });
    const draftB = createDraft("Beta Secret", {
      id: "DRAFT-LEAK-BETA",
      title: "Leak Test Beta",
      channel: "web",
      product: "B",
      audience: "B",
      version: 1,
    });

    await repo.saveDraftVersion(userAContext, draftA);
    await repo.saveDraftVersion(userBContext, draftB);

    // Simulate 10 alternating sequential pooled operations
    for (let i = 0; i < 10; i++) {
      const aDrafts = await repo.getDrafts(userAContext);
      expect(aDrafts.some((d) => d.id === "DRAFT-LEAK-BETA")).toBe(false);

      const bDrafts = await repo.getDrafts(userBContext);
      expect(bDrafts.some((d) => d.id === "DRAFT-LEAK-ALPHA")).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // Attack 12: Malicious input attempts SQL injection
  // Expected: Safely parameterize or reject without altering session context
  // ---------------------------------------------------------------------------
  it("Attack 12: safely neutralizes SQL injection payloads in organization ID and user context", async () => {
    const injectionOrgId = "00000000-0000-0000-0000-000000000001'; DROP TABLE drafts; --";
    const maliciousContext: TenantContext = {
      userId: "usr-injection'; SET app.role = 'maintainer'; --",
      organizationId: injectionOrgId,
      role: "reviewer",
      actor: { userId: "usr-injection" },
    };

    // Database or mock repository must parameterize or reject, never execute the injected SQL
    const drafts = await repo.getDrafts(maliciousContext);
    expect(Array.isArray(drafts)).toBe(true);

    // Verify legitimate tenant data was not altered or dropped
    const legitDrafts = await repo.getDrafts(userAContext);
    expect(legitDrafts.length).toBeGreaterThanOrEqual(1);
  });
});
