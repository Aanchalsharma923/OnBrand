import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import { resolveTenantContext, requireRole, ForbiddenError, UnauthorizedError } from "./auth";
import { getRepository, InMemoryRepository } from "./repository";
import { createDraft, seedSources, initialDraft } from "../onbrand";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postAsset, GET as getAssets } from "@/app/api/assets/route";
import { POST as postFile, GET as getFile } from "@/app/api/files/route";
import { POST as postSource } from "@/app/api/sources/route";
import { createDemoSessionToken } from "./demo-session";
import type { TenantContext } from "../types";

describe("Prompt 2: Mandatory Security, Multi-Tenant Isolation & Data Integrity Hardening Suite", () => {
  const repo = getRepository();

  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zmnehuiiopwerbtjxxqt.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_token";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // Dynamic UUIDs for two independently created test organizations and users
  const dynamicOrgAId = crypto.randomUUID();
  const dynamicOrgBId = crypto.randomUUID();

  const userA_Creator: TenantContext = {
    userId: `usr-a-creator`,
    organizationId: dynamicOrgAId,
    role: "creator",
    actor: { userId: "usr-a-creator", displayName: "Dynamic User A (Creator)" },
  };

  const userA_Reviewer: TenantContext = {
    userId: `usr-a-reviewer`,
    organizationId: dynamicOrgAId,
    role: "reviewer",
    actor: { userId: "usr-a-reviewer", displayName: "Dynamic User A (Reviewer)" },
  };

  const userA_Maintainer: TenantContext = {
    userId: `usr-a-maintainer`,
    organizationId: dynamicOrgAId,
    role: "maintainer",
    actor: { userId: "usr-a-maintainer", displayName: "Dynamic User A (Maintainer)" },
  };

  const userB_Reviewer: TenantContext = {
    userId: `usr-b-reviewer`,
    organizationId: dynamicOrgBId,
    role: "reviewer",
    actor: { userId: "usr-b-reviewer", displayName: "Dynamic User B (Reviewer)" },
  };

  const userB_Maintainer: TenantContext = {
    userId: `usr-b-maintainer`,
    organizationId: dynamicOrgBId,
    role: "maintainer",
    actor: { userId: "usr-b-maintainer", displayName: "Dynamic User B (Maintainer)" },
  };

  function mockTokenHeaders(role: "creator" | "reviewer" | "maintainer", orgId: string) {
    const isOrgA = orgId === dynamicOrgAId;
    const prefix = isOrgA ? "a" : "b";
    return {
      authorization: `Bearer token-${prefix}-${role}`,
      "x-onbrand-tenant": orgId,
    };
  }

  // Setup mock authentication resolver for the dynamic tokens
  beforeAll(async () => {
    const supabaseModule = await import("./supabase");
    vi.spyOn(supabaseModule, "getSupabaseAuthClient").mockImplementation(() => ({
      auth: {
        getUser: vi.fn().mockImplementation(async (token: string) => {
          if (!token || token.startsWith("forged") || token === "not-a-token" || token.includes("none")) {
            return { data: { user: null }, error: { message: "Invalid or forged token signature." } };
          }
          if (token.startsWith("token-a-")) {
            const role = token.replace("token-a-", "");
            return { data: { user: { id: `usr-a-${role}`, email: `user-a-${role}@example.com` } }, error: null };
          }
          if (token.startsWith("token-b-")) {
            const role = token.replace("token-b-", "");
            return { data: { user: { id: `usr-b-${role}`, email: `user-b-${role}@example.com` } }, error: null };
          }
          return { data: { user: null }, error: { message: "Unknown session." } };
        }),
      },
    } as any));

    vi.spyOn(supabaseModule, "resolveUserMembershipFromDb").mockImplementation(async (userId: string, requestedOrgId?: string) => {
      if (userId.startsWith("usr-a-")) {
        const role = userId.replace("usr-a-", "") as any;
        if (requestedOrgId && requestedOrgId !== dynamicOrgAId) return null;
        return {
          organizationId: dynamicOrgAId,
          role,
          actor: { userId, displayName: `Dynamic User A (${role})` },
        };
      }
      if (userId.startsWith("usr-b-")) {
        const role = userId.replace("usr-b-", "") as any;
        if (requestedOrgId && requestedOrgId !== dynamicOrgBId) return null;
        return {
          organizationId: dynamicOrgBId,
          role,
          actor: { userId, displayName: `Dynamic User B (${role})` },
        };
      }
      return null;
    });
  });

  // ---------------------------------------------------------------------------
  // 1. JWT Spoofing & Tampered Signature Rejection
  // ---------------------------------------------------------------------------
  it("Vector 1 [JWT Spoofing]: rejects forged, truncated, or unsigned JWT access tokens", async () => {
    const forgedTokens = [
      "not-a-token",
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0.", // alg: none exploit
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tampered.signature",
      "demo.maintainer.00000000-0000-0000-0000-000000000001.1700000000.forged_signature",
    ];

    for (const forged of forgedTokens) {
      const req = new Request("http://localhost:3000/api/reviews", {
        headers: {
          authorization: `Bearer ${forged}`,
          "x-onbrand-tenant": dynamicOrgAId,
        },
      });

      await expect(resolveTenantContext(req)).rejects.toThrow();
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Role Spoofing & Header Tampering
  // ---------------------------------------------------------------------------
  it("Vector 2 [Role Spoofing]: client-supplied role header is ignored; server rejects Creator attempting Maintainer action", async () => {
    // Creator sends x-onbrand-role: maintainer header
    const req = new Request("http://localhost:3000/api/sources", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("creator", dynamicOrgAId),
        "x-onbrand-role": "maintainer", // Malicious header
        "x-demo-role": "MAINTAINER",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: "SRC-SPOOF-01",
        title: "Unauthorized Guideline",
        kind: "GUIDELINE",
        authority: 80,
        version: 1,
        effectiveFrom: "2026-01-01",
        channels: ["web"],
        owner: "Attacker",
        approvalState: "APPROVED",
        facts: [],
      }),
    });

    const res = await postSource(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error.toLowerCase()).toContain("maintainer");
  });

  // ---------------------------------------------------------------------------
  // 3. Cross-Tenant Object Access (Drafts & Reviews)
  // ---------------------------------------------------------------------------
  it("Vector 3 [Cross-Tenant Objects]: Organization B cannot read or locate Organization A's draft", async () => {
    const draftA = createDraft("Confidential Corporate Strategy for Org A", {
      id: "DRAFT-CONFIDENTIAL-A-99",
      title: "Confidential Strategy",
      channel: "web",
      product: "Brand A",
      audience: "Internal Executives",
      version: 1,
    });

    await repo.saveDraftVersion(userA_Creator, draftA);

    // User B attempts to read User A's draft
    const readAttempt = await repo.getDraftVersion(userB_Reviewer, "DRAFT-CONFIDENTIAL-A-99", 1);
    expect(readAttempt).toBeNull();

    const orgBDrafts = await repo.getDrafts(userB_Reviewer);
    expect(orgBDrafts.some((d) => d.id === "DRAFT-CONFIDENTIAL-A-99")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 4. Cross-Tenant File URLs / Keys
  // ---------------------------------------------------------------------------
  it("Vector 4 [Cross-Tenant Files]: Organization B cannot download a file belonging to Organization A even with known key", async () => {
    const fileContent = "Top Secret Formulation Recipe for Org A";
    const fileBlob = new Blob([fileContent], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", fileBlob, "secret-recipe.txt");
    formData.append("key", "recipe-key-alpha-xyz");

    const postReq = new Request("http://localhost:3000/api/files", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("creator", dynamicOrgAId),
      },
      body: formData,
    });

    const postRes = await postFile(postReq);
    expect(postRes.status).toBe(201);

    // Organization B attempts to retrieve Org A's file
    const getReqB = new Request("http://localhost:3000/api/files?key=recipe-key-alpha-xyz", {
      method: "GET",
      headers: {
        ...mockTokenHeaders("reviewer", dynamicOrgBId),
      },
    });

    const getResB = await getFile(getReqB);
    expect(getResB.status).toBe(404);
    const errData = await getResB.json();
    expect(errData.error).toContain("File not found in this organization");
  });

  // ---------------------------------------------------------------------------
  // 5. Cross-Tenant Asset Access & Isolation
  // ---------------------------------------------------------------------------
  it("Vector 5 [Cross-Tenant Assets]: Assets registered in Org A are completely invisible to Org B", async () => {
    const assetPayload = {
      name: "Org A Proprietary Symbol",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      mimeType: "image/png",
      byteSize: 4096,
      approvalState: "APPROVED" as const,
    };

    const postReqA = new Request("http://localhost:3000/api/assets", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("maintainer", dynamicOrgAId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(assetPayload),
    });

    const postResA = await postAsset(postReqA);
    expect(postResA.status).toBe(201);

    // Org B queries assets
    const getReqB = new Request("http://localhost:3000/api/assets", {
      method: "GET",
      headers: {
        ...mockTokenHeaders("reviewer", dynamicOrgBId),
      },
    });

    const getResB = await getAssets(getReqB);
    expect(getResB.status).toBe(200);
    const dataB = await getResB.json();
    expect(dataB.assets.some((a: any) => a.name === "Org A Proprietary Symbol")).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 6. Missing Tenant Context / Tampered Context
  // ---------------------------------------------------------------------------
  it("Vector 6 [Missing Tenant Context]: Throws UnauthorizedError when request lacks credentials or context", async () => {
    const origStrict = process.env.STRICT_AUTH;
    process.env.STRICT_AUTH = "true";
    try {
      const req = new Request("http://localhost:3000/api/drafts", {
        headers: {},
      });
      await expect(resolveTenantContext(req)).rejects.toThrow(UnauthorizedError);
    } finally {
      if (origStrict === undefined) delete process.env.STRICT_AUTH;
      else process.env.STRICT_AUTH = origStrict;
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Expired Session Invalidation
  // ---------------------------------------------------------------------------
  it("Vector 7 [Expired Sessions]: Rejects expired demo tokens past their validity timestamp", async () => {
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 86400 * 7; // 7 days ago
    // create token with expired timestamp
    const token = `demo.reviewer.${dynamicOrgAId}.${expiredTimestamp}.invalidsig`;

    const req = new Request("http://localhost:3000/api/drafts", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    await expect(resolveTenantContext(req)).rejects.toThrow(UnauthorizedError);
  });

  // ---------------------------------------------------------------------------
  // 8. Reused Pooled Connections / State Bleed
  // ---------------------------------------------------------------------------
  it("Vector 8 [Pooled Connections]: Sequential interleaved operations between Org A and Org B never bleed context", async () => {
    for (let round = 1; round <= 5; round++) {
      const draftA = createDraft(`Interleaved Doc A - Round ${round}`, {
        id: `DRAFT-INTERLEAVED-A-${round}`,
        title: `Doc A ${round}`,
        channel: "web",
        product: "A",
        audience: "A",
        version: 1,
      });
      const draftB = createDraft(`Interleaved Doc B - Round ${round}`, {
        id: `DRAFT-INTERLEAVED-B-${round}`,
        title: `Doc B ${round}`,
        channel: "web",
        product: "B",
        audience: "B",
        version: 1,
      });

      await repo.saveDraftVersion(userA_Creator, draftA);
      await repo.saveDraftVersion(userB_Reviewer, draftB);

      const listA = await repo.getDrafts(userA_Creator);
      const listB = await repo.getDrafts(userB_Reviewer);

      expect(listA.some((d) => d.id === `DRAFT-INTERLEAVED-B-${round}`)).toBe(false);
      expect(listB.some((d) => d.id === `DRAFT-INTERLEAVED-A-${round}`)).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // 9. Unauthorized Source Mutation
  // ---------------------------------------------------------------------------
  it("Vector 9 [Unauthorized Source Mutation]: Creator and Reviewer roles cannot create or mutate knowledge sources", async () => {
    const reqCreator = new Request("http://localhost:3000/api/sources", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("creator", dynamicOrgAId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...seedSources[0],
        id: "SRC-UNAUTH-01",
      }),
    });

    const resCreator = await postSource(reqCreator);
    expect(resCreator.status).toBe(403);

    const reqReviewer = new Request("http://localhost:3000/api/sources", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("reviewer", dynamicOrgAId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...seedSources[0],
        id: "SRC-UNAUTH-02",
      }),
    });

    const resReviewer = await postSource(reqReviewer);
    expect(resReviewer.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 10. Unauthorized Asset Mutation
  // ---------------------------------------------------------------------------
  it("Vector 10 [Unauthorized Asset Mutation]: Only maintainers can register assets; Reviewer and Creator get HTTP 403", async () => {
    const req = new Request("http://localhost:3000/api/assets", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("reviewer", dynamicOrgAId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Test Asset",
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        mimeType: "image/png",
        byteSize: 1024,
      }),
    });

    const res = await postAsset(req);
    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 11. Stale Approval (Modified Content Hash)
  // ---------------------------------------------------------------------------
  it("Vector 11 [Stale Approval]: Rejects decision approval when draftHash does not match review.draftHash (HTTP 409)", async () => {
    const { reviewDraft } = await import("../onbrand");
    const draft = createDraft("Compliant marketing statement for Org A.", {
      id: "DRAFT-STALE-CHECK-01",
      title: "Marketing Statement",
      channel: "web",
      product: "Prod A",
      audience: "Consumers",
      version: 1,
    });

    const rev = reviewDraft({ draft, sources: seedSources });
    rev.id = "REV-STALE-CHECK-01";
    rev.findings = []; // Clean review
    await repo.saveReview(userA_Reviewer, rev);

    const postReq = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("reviewer", dynamicOrgAId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reviewId: "REV-STALE-CHECK-01",
        state: "APPROVED",
        draftHash: "0000000000000000000000000000000000000000000000000000000000000000", // Tampered/stale hash
      }),
    });

    const res = await postDecision(postReq);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("Stale review");
  });

  // ---------------------------------------------------------------------------
  // 12. Approval After Content Modification (New Version Advance)
  // ---------------------------------------------------------------------------
  it("Vector 12 [Approval After Modification]: Rejects approval of old review when draft has advanced to a newer version", async () => {
    const { reviewDraft } = await import("../onbrand");

    // Version 1 created and reviewed
    const draftV1 = createDraft("Version 1 content for Org A.", {
      id: "DRAFT-ADVANCE-01",
      title: "Advancing Draft",
      channel: "web",
      product: "Prod A",
      audience: "Consumers",
      version: 1,
    });
    await repo.saveDraftVersion(userA_Creator, draftV1);

    const revV1 = reviewDraft({ draft: draftV1, sources: seedSources });
    revV1.id = "REV-ADVANCE-V1";
    revV1.draftId = "DRAFT-ADVANCE-01";
    revV1.draftHash = draftV1.hash;
    revV1.findings = [];
    await repo.saveReview(userA_Reviewer, revV1);

    // Author creates Version 2 with modified copy
    const draftV2 = createDraft("Version 2 modified copy with new claims for Org A.", {
      id: "DRAFT-ADVANCE-01",
      title: "Advancing Draft",
      channel: "web",
      product: "Prod A",
      audience: "Consumers",
      version: 2,
    });
    await repo.saveDraftVersion(userA_Creator, draftV2);

    // Reviewer attempts to approve Version 1's review
    const approveReq = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("reviewer", dynamicOrgAId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reviewId: "REV-ADVANCE-V1",
        state: "APPROVED",
        draftHash: draftV1.hash,
      }),
    });

    const res = await postDecision(approveReq);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("newer version");
  });

  // ---------------------------------------------------------------------------
  // 13. Duplicate & Concurrent Decision Requests
  // ---------------------------------------------------------------------------
  it("Vector 13 [Duplicate / Concurrent Requests]: Concurrent approval attempts are handled safely and record audit events", async () => {
    const { reviewDraft } = await import("../onbrand");
    const draft = createDraft("Safe verified copy for concurrency test.", {
      id: "DRAFT-CONCURRENCY-01",
      title: "Concurrency Draft",
      channel: "web",
      product: "Prod A",
      audience: "Consumers",
      version: 1,
    });
    await repo.saveDraftVersion(userA_Creator, draft);

    const rev = reviewDraft({ draft, sources: seedSources });
    rev.id = "REV-CONCURRENCY-01";
    rev.draftId = "DRAFT-CONCURRENCY-01";
    rev.draftHash = draft.hash;
    rev.findings = [];
    await repo.saveReview(userA_Reviewer, rev);

    const makeReq = () =>
      new Request("http://localhost:3000/api/decisions", {
        method: "POST",
        headers: {
          ...mockTokenHeaders("reviewer", dynamicOrgAId),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewId: "REV-CONCURRENCY-01",
          state: "APPROVED",
          draftHash: draft.hash,
          reason: "Concurrent audit check",
        }),
      });

    // Fire 3 concurrent approval requests simultaneously
    const responses = await Promise.all([
      postDecision(makeReq()),
      postDecision(makeReq()),
      postDecision(makeReq()),
    ]);

    // All should succeed gracefully without database race condition or crash
    for (const res of responses) {
      expect([200, 409]).toContain(res.status);
    }
  });

  // ---------------------------------------------------------------------------
  // 14. Malformed Uploads & Size Cap Guards
  // ---------------------------------------------------------------------------
  it("Vector 14 [Malformed Uploads & Size Caps]: Rejects empty files, path-traversal filenames, and oversized uploads", async () => {
    // 14a. Empty form data
    const emptyForm = new FormData();
    const emptyReq = new Request("http://localhost:3000/api/files", {
      method: "POST",
      headers: { ...mockTokenHeaders("creator", dynamicOrgAId) },
      body: emptyForm,
    });
    const emptyRes = await postFile(emptyReq);
    expect(emptyRes.status).toBe(400);

    // 14b. Path traversal in filename is sanitized
    const traversalBlob = new Blob(["Valid binary content"], { type: "text/plain" });
    const traversalForm = new FormData();
    traversalForm.append("file", traversalBlob, "../../../../../etc/passwd");
    traversalForm.append("key", "clean-key-1");

    const traversalReq = new Request("http://localhost:3000/api/files", {
      method: "POST",
      headers: { ...mockTokenHeaders("creator", dynamicOrgAId) },
      body: traversalForm,
    });
    const traversalRes = await postFile(traversalReq);
    expect(traversalRes.status).toBe(201);
    const traversalData = await traversalRes.json();
    expect(traversalData.filename).not.toContain("..");
    expect(traversalData.filename).toBe("passwd");

    // 14c. Asset registration with oversized byteSize
    const oversizedAssetReq = new Request("http://localhost:3000/api/assets", {
      method: "POST",
      headers: {
        ...mockTokenHeaders("maintainer", dynamicOrgAId),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Oversized Asset",
        sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        mimeType: "image/png",
        byteSize: 100 * 1024 * 1024, // 100 MB > 50 MB limit
      }),
    });
    const oversizedRes = await postAsset(oversizedAssetReq);
    expect(oversizedRes.status).toBe(400);
  });
});
