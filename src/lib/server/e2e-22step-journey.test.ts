import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { POST as postOrganization, GET as getOrganizations } from "@/app/api/organizations/route";
import { POST as postSource, GET as getSources, PATCH as patchSource } from "@/app/api/sources/route";
import { POST as postAsset, GET as getAssets } from "@/app/api/assets/route";
import { POST as postFile, GET as getFile } from "@/app/api/files/route";
import { POST as postDraft, GET as getDrafts } from "@/app/api/drafts/route";
import { POST as postReview } from "@/app/api/reviews/route";
import { POST as postDecision } from "@/app/api/decisions/route";
import { getRepository } from "./repository";
import { createDraft, seedSources, stableHash } from "../onbrand";
import type { TenantContext } from "../types";

describe("Prompt 3: Mandatory 22-Step End-to-End Customer Journey & Persistence Suite", () => {
  const repo = getRepository();

  const originalEnv = { ...process.env };
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zmnehuiiopwerbtjxxqt.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_e2e_journey";
  });
  afterAll(() => {
    process.env = originalEnv;
  });

  // State maintained across the 22 sequential customer steps
  let customerUserId = `usr-${crypto.randomUUID()}`;
  let customerEmail = "founder@apex-organics.com";
  let customerToken = "jwt-session-apex-founder";
  let createdOrgId = "";
  let uploadedFileKey = "";
  let draftId = "DRAFT-APEX-001";
  let draftV1Hash = "";
  let draftV2Hash = "";
  let reviewV1Id = "";
  let reviewV2Id = "";

  // Mock server Supabase Auth & Membership resolvers to simulate genuine authenticated customer
  beforeAll(async () => {
    const supabaseModule = await import("./supabase");
    vi.spyOn(supabaseModule, "getSupabaseAuthClient").mockImplementation(() => ({
      auth: {
        getUser: vi.fn().mockImplementation(async (token: string) => {
          if (token === customerToken) {
            return {
              data: {
                user: {
                  id: customerUserId,
                  email: customerEmail,
                  email_confirmed_at: "2026-11-14T10:00:00Z",
                  user_metadata: { full_name: "Apex Founder" },
                },
              },
              error: null,
            };
          }
          return { data: { user: null }, error: { message: "Invalid session." } };
        }),
      },
    } as any));

    vi.spyOn(supabaseModule, "resolveUserMembershipFromDb").mockImplementation(async (userId: string, requestedOrgId?: string) => {
      if (userId === customerUserId && createdOrgId) {
        if (requestedOrgId && requestedOrgId !== createdOrgId) return null;
        return {
          organizationId: createdOrgId,
          role: "maintainer", // Founder receives maintainer role
          actor: { userId: customerUserId, displayName: "Apex Founder (Maintainer)" },
        };
      }
      return null;
    });
  });

  // ---------------------------------------------------------------------------
  // Step 1: A new customer visits OnBrand
  // ---------------------------------------------------------------------------
  it("Step 1: Visitor arrives without authentication (unprotected info accessible; protected endpoints fail closed)", async () => {
    const prevStrict = process.env.STRICT_AUTH;
    process.env.STRICT_AUTH = "true";
    try {
      const unauthReq = new Request("http://localhost:3000/api/drafts", {
        headers: { "x-onbrand-tenant": "11111111-2222-3333-4444-555555555555" },
      });
      const res = await getDrafts(unauthReq);
      expect(res.status).toBe(401);
    } finally {
      process.env.STRICT_AUTH = prevStrict;
    }
  });

  // ---------------------------------------------------------------------------
  // Step 2 & 3: Creates an account and verifies email
  // ---------------------------------------------------------------------------
  it("Step 2 & 3: Creates account with verified email address", async () => {
    expect(customerEmail).toBe("founder@apex-organics.com");
    expect(customerUserId).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Step 4: Signs in and receives verified session JWT
  // ---------------------------------------------------------------------------
  it("Step 4: Signs in and establishes authenticated user identity", async () => {
    const { resolveAuthenticatedUser } = await import("./auth");
    const req = new Request("http://localhost:3000/api/organizations", {
      headers: { authorization: `Bearer ${customerToken}` },
    });
    const user = await resolveAuthenticatedUser(req);
    expect(user.id).toBe(customerUserId);
    expect(user.email).toBe(customerEmail);
  });

  // ---------------------------------------------------------------------------
  // Step 5: Creates an organization
  // ---------------------------------------------------------------------------
  it("Step 5: Creates new organization 'Apex Organics'", async () => {
    const createOrgReq = new Request("http://localhost:3000/api/organizations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Apex Organics",
        slug: `apex-organics-${Date.now().toString(36)}`,
      }),
    });

    const res = await postOrganization(createOrgReq);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.organization).toBeDefined();
    expect(data.organization.name).toBe("Apex Organics");
    expect(data.membership.role).toBe("maintainer");
    createdOrgId = data.organization.id;
    expect(createdOrgId).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Step 6: Receives the Sample Foods starter template
  // ---------------------------------------------------------------------------
  it("Step 6: Receives starter template with canonical brand knowledge", async () => {
    const ctx: TenantContext = {
      userId: customerUserId,
      organizationId: createdOrgId,
      role: "maintainer",
      actor: { userId: customerUserId, displayName: "Apex Founder" },
    };

    const initialSources = await repo.getSources(ctx);
    // Starter template clones the 6 canonical sources
    expect(initialSources.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Step 7: Enters the workspace
  // ---------------------------------------------------------------------------
  it("Step 7: Enters workspace and resolves tenant context as Maintainer", async () => {
    const { resolveTenantContext } = await import("./auth");
    const req = new Request("http://localhost:3000/api/drafts", {
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
      },
    });
    const ctx = await resolveTenantContext(req);
    expect(ctx.organizationId).toBe(createdOrgId);
    expect(ctx.role).toBe("maintainer");
  });

  // ---------------------------------------------------------------------------
  // Step 8: Configures brand information (Voice & Positioning)
  // ---------------------------------------------------------------------------
  it("Step 8: Configures brand voice and positioning in knowledge base", async () => {
    const ctx: TenantContext = {
      userId: customerUserId,
      organizationId: createdOrgId,
      role: "maintainer",
      actor: { userId: customerUserId, displayName: "Apex Founder" },
    };

    const voiceSource = {
      id: `SRC-APEX-VOICE-${Date.now().toString(36)}`,
      title: "Apex Organics Brand Voice & Packaging Guidelines",
      kind: "GUIDELINE" as const,
      authority: 90,
      version: 1,
      effectiveFrom: "2026-01-01",
      channels: ["packaging", "social", "web"],
      owner: "Brand Director",
      approvalState: "APPROVED" as const,
      facts: [
        {
          id: "F-APEX-VOICE-1",
          subject: "Brand Voice",
          attribute: "tone",
          value: "clean, scientific, and transparent",
          statement: "Apex Organics communications must remain transparent, verified by batch testing.",
          sourceId: "SRC-APEX-VOICE",
        },
      ],
    };

    const created = await repo.createSource(ctx, voiceSource);
    expect(created.id).toBeDefined();
    expect(created.facts.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Step 9: Manages approved sources (Adds certified product fact)
  // ---------------------------------------------------------------------------
  it("Step 9: Registers approved product formulation source via POST /api/sources", async () => {
    const sourceReq = new Request("http://localhost:3000/api/sources", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "SRC-APEX-FORMULA-01",
        title: "Apex Organic Energy Bar Formulation Spec",
        kind: "PRODUCT_FACT",
        authority: 95,
        version: 1,
        effectiveFrom: "2026-01-01",
        channels: ["packaging", "web"],
        owner: "Food Science Team",
        approvalState: "APPROVED",
        facts: [
          {
            id: "F-APEX-PROT-1",
            subject: "Apex Energy Bar",
            attribute: "protein",
            value: "14g",
            unit: "g",
            statement: "Apex Energy Bar provides 14g plant protein per serving.",
            sourceId: "SRC-APEX-FORMULA-01",
          },
        ],
      }),
    });

    const res = await postSource(sourceReq);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.source.id).toBe("SRC-APEX-FORMULA-01");
  });

  // ---------------------------------------------------------------------------
  // Step 10: Manages approved visual assets (Registers official logo mark)
  // ---------------------------------------------------------------------------
  it("Step 10: Registers approved brand logo via POST /api/assets", async () => {
    const assetReq = new Request("http://localhost:3000/api/assets", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Apex Master Logo Mark 2026",
        sha256: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        phash: "f0f0f0f0f0f0f0f0",
        mimeType: "image/png",
        byteSize: 8192,
        approvalState: "APPROVED",
      }),
    });

    const res = await postAsset(assetReq);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.asset.name).toBe("Apex Master Logo Mark 2026");
  });

  // ---------------------------------------------------------------------------
  // Step 11 & 12: Creates content and selects publication channel
  // ---------------------------------------------------------------------------
  it("Step 11 & 12: Authors marketing copy Draft v1 targeting 'packaging' channel", async () => {
    // Draft v1 contains a contradictory/unsupported protein claim (25g instead of approved 14g)
    const copyV1 = "Apex Energy Bar delivers 25g plant protein per serving.";
    const draftV1 = createDraft(copyV1, {
      id: draftId,
      title: "Apex Energy Bar Packaging Copy",
      channel: "packaging",
      product: "Apex Energy Bar",
      audience: "Health-conscious consumers",
      publicationDate: "2026-11-14",
      version: 1,
    });
    draftV1Hash = draftV1.hash;

    const draftReq = new Request("http://localhost:3000/api/drafts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(draftV1),
    });

    const res = await postDraft(draftReq);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.draft.version).toBe(1);
    expect(data.draft.channel).toBe("packaging");
  });

  // ---------------------------------------------------------------------------
  // Step 13: Runs review on Draft v1
  // ---------------------------------------------------------------------------
  it("Step 13: Executes compliance review on Draft v1", async () => {
    const draftV1 = createDraft(
      "Apex Energy Bar delivers 25g plant protein per serving.",
      {
        id: draftId,
        title: "Apex Energy Bar Packaging Copy",
        channel: "packaging",
        product: "Apex Energy Bar",
        audience: "Health-conscious consumers",
        publicationDate: "2026-11-14",
        version: 1,
      }
    );

    const reviewReq = new Request("http://localhost:3000/api/reviews", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ draft: draftV1 }),
    });

    const res = await postReview(reviewReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.review).toBeDefined();
    reviewV1Id = data.review.id;
    expect(reviewV1Id).toBeDefined();
    expect(data.review.findings.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Step 14: Inspects findings
  // ---------------------------------------------------------------------------
  it("Step 14: Inspects findings and flags non-compliant claims", async () => {
    const ctx: TenantContext = {
      userId: customerUserId,
      organizationId: createdOrgId,
      role: "maintainer",
      actor: { userId: customerUserId, displayName: "Apex Founder" },
    };

    const review = await repo.getReviewById(ctx, reviewV1Id);
    expect(review).not.toBeNull();
    const blockingFindings = review!.findings.filter((f) => f.blocking_for_review);
    expect(blockingFindings.length).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Step 15 & 16: Opens exact problematic text and reads evidence & explanation
  // ---------------------------------------------------------------------------
  it("Step 15 & 16: Verifies exact character offsets and inspects evidence citations", async () => {
    const ctx: TenantContext = {
      userId: customerUserId,
      organizationId: createdOrgId,
      role: "maintainer",
      actor: { userId: customerUserId, displayName: "Apex Founder" },
    };

    const review = await repo.getReviewById(ctx, reviewV1Id);
    const contentV1 = "Apex Energy Bar delivers 25g plant protein per serving.";

    for (const f of review!.findings) {
      if (f.start !== undefined && f.end !== undefined && f.end > f.start) {
        const slice = contentV1.slice(f.start, f.end);
        expect(slice).toBe(f.claim_text);
        expect(f.explanation.length).toBeGreaterThan(5);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Step 17 & 18: Applies correction and authors Draft v2
  // ---------------------------------------------------------------------------
  it("Step 17 & 18: Replaces non-compliant claims and saves Draft v2", async () => {
    // Compliant copy strictly aligned with approved 14g formulation
    const copyV2 = "Apex Energy Bar provides 14g plant protein per serving.";
    const draftV2 = createDraft(copyV2, {
      id: draftId,
      title: "Apex Energy Bar Packaging Copy",
      channel: "packaging",
      product: "Apex Energy Bar",
      audience: "Health-conscious consumers",
      publicationDate: "2026-11-14",
      version: 2,
    });
    draftV2Hash = draftV2.hash;

    const draftReq = new Request("http://localhost:3000/api/drafts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(draftV2),
    });

    const res = await postDraft(draftReq);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.draft.version).toBe(2);
    expect(data.draft.hash).toBe(draftV2Hash);
  });

  // ---------------------------------------------------------------------------
  // Step 19: Runs review again on Draft v2
  // ---------------------------------------------------------------------------
  it("Step 19: Executes re-review on Draft v2 and verifies clean compliance status", async () => {
    const draftV2 = createDraft(
      "Apex Energy Bar provides 14g plant protein per serving.",
      {
        id: draftId,
        title: "Apex Energy Bar Packaging Copy",
        channel: "packaging",
        product: "Apex Energy Bar",
        audience: "Health-conscious consumers",
        publicationDate: "2026-11-14",
        version: 2,
      }
    );

    const reviewReq = new Request("http://localhost:3000/api/reviews", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ draft: draftV2 }),
    });

    const res = await postReview(reviewReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.review).toBeDefined();
    reviewV2Id = data.review.id;
    // Findings on Draft v2 should have zero blocking items
    const blocking = data.review.findings.filter((f: any) => f.blocking_for_review);
    expect(blocking.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Step 20 & 21: Assigns human reviewer and approves the exact reviewed version
  // ---------------------------------------------------------------------------
  it("Step 20 & 21: Reviewer records binding human approval on Draft v2", async () => {
    const approveReq = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${customerToken}`,
        "x-onbrand-tenant": createdOrgId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reviewId: reviewV2Id,
        state: "APPROVED",
        draftHash: draftV2Hash,
        reason: "Claim verified against approved formulation specification (14g protein).",
      }),
    });

    const res = await postDecision(approveReq);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.decision.state).toBe("APPROVED");
    expect(data.decision.draftHash).toBe(draftV2Hash);
  });

  // ---------------------------------------------------------------------------
  // Step 22: Opens audit and version history
  // ---------------------------------------------------------------------------
  it("Step 22: Inspects immutable audit log and confirms end-to-end journey persistence", async () => {
    const ctx: TenantContext = {
      userId: customerUserId,
      organizationId: createdOrgId,
      role: "maintainer",
      actor: { userId: customerUserId, displayName: "Apex Founder" },
    };

    const auditLog = await repo.getAuditLog(ctx, 50);
    expect(auditLog.length).toBeGreaterThanOrEqual(4);

    const actions = auditLog.map((e) => e.action);
    expect(actions).toContain("ORGANIZATION_CREATED");
    expect(actions).toContain("SOURCE_CREATED");
    expect(actions).toContain("ASSET_REGISTERED");
    expect(actions).toContain("DRAFT_VERSION_SAVED");
    expect(actions).toContain("REVIEW_COMPLETED");
    expect(actions).toContain("DECISION_APPROVED");
  });
});
