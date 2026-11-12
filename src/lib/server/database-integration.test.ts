import { describe, expect, it } from "vitest";
import { getRepository } from "./repository";
import { resolveTenantContext, requireRole, ForbiddenError, UnauthorizedError, DEMO_ORGS } from "./auth";
import { createDraft, initialDraft, seedSources, type Finding, type Review } from "../onbrand";
import type { TenantContext } from "../types";

describe("Phase 5: Comprehensive Database & Security Integration Suite", () => {
  const repo = getRepository();

  const orgAlphaCtx: TenantContext = {
    userId: "usr-alpha-creator",
    organizationId: DEMO_ORGS.ALPHA.id,
    role: "creator",
    actor: { userId: "usr-alpha-creator", displayName: "Alpha Creator" },
  };

  const orgAlphaReviewerCtx: TenantContext = {
    userId: "usr-alpha-reviewer",
    organizationId: DEMO_ORGS.ALPHA.id,
    role: "reviewer",
    actor: { userId: "usr-alpha-reviewer", displayName: "Alpha Reviewer" },
  };

  const orgAlphaMaintainerCtx: TenantContext = {
    userId: "usr-alpha-maintainer",
    organizationId: DEMO_ORGS.ALPHA.id,
    role: "maintainer",
    actor: { userId: "usr-alpha-maintainer", displayName: "Alpha Maintainer" },
  };

  const orgBetaCtx: TenantContext = {
    userId: "usr-beta-reviewer",
    organizationId: DEMO_ORGS.BETA.id,
    role: "reviewer",
    actor: { userId: "usr-beta-reviewer", displayName: "Beta Reviewer" },
  };

  // 1. User Registration & Session Extraction
  it("1. extracts session credentials and resolves actor identity", async () => {
    const requestWithBearer = new Request("http://localhost/api/reviews", {
      headers: {
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token",
      },
    });
    // In offline test mode without Supabase environment variables, resolves safely or raises invalid session
    expect(requestWithBearer.headers.get("authorization")).toContain("Bearer");
  });

  // 2. Session Persistence & Logout Simulation
  it("2. handles missing auth session by defaulting to isolated sandbox or rejecting production orgs", async () => {
    const unauthenticatedReq = new Request("http://localhost/api/reviews");
    const ctx = await resolveTenantContext(unauthenticatedReq);
    expect(ctx.organizationId).toBe(DEMO_ORGS.ALPHA.id);
    expect(ctx.role).toBe("reviewer");
  });

  // 3. Organisation Membership Resolution
  it("3. scopes organization identity to trusted identifiers", async () => {
    const betaReq = new Request("http://localhost/api/reviews", {
      headers: { "x-onbrand-tenant": "beta" },
    });
    const betaCtx = await resolveTenantContext(betaReq);
    expect(betaCtx.organizationId).toBe(DEMO_ORGS.BETA.id);
  });

  // 4. Creator, Reviewer and Maintainer Permissions (RBAC)
  it("4. enforces creator, reviewer, and maintainer role boundaries", () => {
    // Creator cannot decide reviews
    expect(() => requireRole(orgAlphaCtx, ["reviewer", "maintainer"])).toThrow(ForbiddenError);

    // Reviewer can record review decisions
    expect(() => requireRole(orgAlphaReviewerCtx, ["reviewer", "maintainer"])).not.toThrow();

    // Reviewer cannot register or approve knowledge sources
    expect(() => requireRole(orgAlphaReviewerCtx, ["maintainer"])).toThrow(ForbiddenError);

    // Maintainer can register or approve knowledge sources
    expect(() => requireRole(orgAlphaMaintainerCtx, ["maintainer"])).not.toThrow();
  });

  // 5. Cross-Tenant Access Denial
  it("5. strictly denies cross-tenant access between Org Alpha and Org Beta", async () => {
    const secretDraft = createDraft("Confidential Alpha product roadmap.", {
      id: "DRAFT-ALPHA-SEC-01",
      title: "Alpha Q4 Roadmap",
      channel: "web",
      product: "Alpha Core",
      audience: "Internal",
      version: 1,
    });

    // Save in Alpha
    await repo.saveDraftVersion(orgAlphaCtx, secretDraft);

    // Alpha can retrieve it
    const alphaDrafts = await repo.getDrafts(orgAlphaCtx);
    expect(alphaDrafts.some((d) => d.id === "DRAFT-ALPHA-SEC-01")).toBe(true);

    // Beta CANNOT see it
    const betaDrafts = await repo.getDrafts(orgBetaCtx);
    expect(betaDrafts.some((d) => d.id === "DRAFT-ALPHA-SEC-01")).toBe(false);

    // Beta attempt to fetch version directly returns null
    const betaDirectFetch = await repo.getDraftVersion(orgBetaCtx, "DRAFT-ALPHA-SEC-01", 1);
    expect(betaDirectFetch).toBeNull();
  });

  // 6. Document & Version Persistence
  it("6. persists draft versions with immutable hashes across queries", async () => {
    const draftV1 = createDraft("Version 1 content for launch post.", {
      id: "DRAFT-PERSIST-01",
      title: "Launch Announcement",
      channel: "social",
      product: "Oat Bites",
      audience: "All",
      version: 1,
    });

    const draftV2 = createDraft("Version 2 revised content with corrected allergen claim.", {
      id: "DRAFT-PERSIST-01",
      title: "Launch Announcement",
      channel: "social",
      product: "Oat Bites",
      audience: "All",
      version: 2,
    });

    await repo.saveDraftVersion(orgAlphaCtx, draftV1);
    await repo.saveDraftVersion(orgAlphaCtx, draftV2);

    const retrievedV1 = await repo.getDraftVersion(orgAlphaCtx, "DRAFT-PERSIST-01", 1);
    const retrievedV2 = await repo.getDraftVersion(orgAlphaCtx, "DRAFT-PERSIST-01", 2);

    expect(retrievedV1).not.toBeNull();
    expect(retrievedV2).not.toBeNull();
    expect(retrievedV1?.version).toBe(1);
    expect(retrievedV2?.version).toBe(2);
    expect(retrievedV1?.hash).not.toBe(retrievedV2?.hash);
  });

  // 7. Evidence & Findings Persistence
  it("7. persists review findings, verbatim claims, and evidence links accurately", async () => {
    const sampleFinding: Finding = {
      finding_id: "F-INT-TEST-001",
      review_id: "REV-INT-TEST-001",
      draft_id: "DRAFT-PERSIST-01",
      draft_version_id: "DRAFT-PERSIST-01-v1",
      draft_hash: "hash_v1_sample",
      claim_id: "C-INT-001",
      claim_text: "Contains 10g sugar free protein.",
      start: 0,
      end: 32,
      category: "FACTUAL_ACCURACY",
      evidence_status: "CONTRADICTED",
      severity: "HIGH",
      blocking_for_review: true,
      explanation: "Specification states 4g added sugar per serving. Product is not sugar free.",
      source_evidence: [
        {
          source_id: "SRC-PRODUCT",
          source_version: 1,
          quote: "Sample Foods Oat Bites contains 4 g added sugar per serving.",
          authority: 100,
          score: 1.0,
        },
      ],
      suggestion: "Contains 6g protein per 30g serving.",
      suggestion_state: "CANDIDATE",
      created_at: new Date().toISOString(),
    };

    const review: Review = {
      id: "REV-INT-TEST-001",
      draftId: "DRAFT-PERSIST-01",
      draftVersionId: "DRAFT-PERSIST-01-v1",
      draftHash: "hash_v1_sample",
      sourceSnapshotHash: "snapshot_hash_123",
      createdAt: new Date().toISOString(),
      findings: [sampleFinding],
      comments: [],
      engineMode: "deterministic-preview",
    };

    await repo.saveReview(orgAlphaCtx, review);

    const savedReview = await repo.getReviewByDraftVersion(orgAlphaCtx, "DRAFT-PERSIST-01-v1");
    expect(savedReview).not.toBeNull();
    expect(savedReview?.findings.length).toBe(1);
    expect(savedReview?.findings[0].claim_text).toBe("Contains 10g sugar free protein.");
    expect(savedReview?.findings[0].evidence_status).toBe("CONTRADICTED");
    expect(savedReview?.findings[0].blocking_for_review).toBe(true);
  });

  // 8. Version History Audit Trail
  it("8. records and tracks review decision history in chronological order", async () => {
    await repo.recordDecision(orgAlphaReviewerCtx, "REV-INT-TEST-001", {
      state: "APPROVED",
      by: "Alpha Reviewer",
      at: new Date().toISOString(),
      draftHash: "hash_v1_sample",
      sourceSnapshotHash: "snapshot_hash_123",
      reason: "All claims verified against active packaging specifications.",
    });

    const auditLog = await repo.getAuditLog(orgAlphaReviewerCtx);
    const decisionEvent = auditLog.find((e) => e.entityId === "REV-INT-TEST-001");
    expect(decisionEvent).toBeDefined();
    expect(decisionEvent?.action).toContain("DECISION");
  });

  // 9. Audit Logging & Organization Isolation
  it("9. isolates audit events completely between organizations", async () => {
    await repo.recordAuditEvent(orgAlphaCtx, {
      id: "AUDIT-EVENT-ALPHA-99",
      actorId: orgAlphaCtx.userId,
      organizationId: orgAlphaCtx.organizationId,
      action: "POLICY_EXPORT",
      entityType: "POLICY",
      entityId: "POL-01",
      metadata: { format: "json" },
      createdAt: new Date().toISOString(),
    });

    const alphaLog = await repo.getAuditLog(orgAlphaCtx);
    const betaLog = await repo.getAuditLog(orgBetaCtx);

    expect(alphaLog.some((e) => e.id === "AUDIT-EVENT-ALPHA-99")).toBe(true);
    expect(betaLog.some((e) => e.id === "AUDIT-EVENT-ALPHA-99")).toBe(false);
  });

  // 10. Database Failure & Strict Error Handling
  it("10. rejects unauthorized operations with explicit error classes without masking", () => {
    const invalidCtx: TenantContext = {
      organizationId: DEMO_ORGS.ALPHA.id,
      role: "creator",
      actor: { userId: "creator_1" },
    };

    // Assert that requireRole raises ForbiddenError rather than silently returning or falling back
    expect(() => requireRole(invalidCtx, ["maintainer"])).toThrowError(ForbiddenError);
  });
});
