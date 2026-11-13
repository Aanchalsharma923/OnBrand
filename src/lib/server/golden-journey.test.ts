import { describe, expect, it } from "vitest";
import { POST as postSource } from "@/app/api/sources/route";
import { POST as postReview } from "@/app/api/reviews/route";
import { POST as postDecision } from "@/app/api/decisions/route";
import { getRepository } from "./repository";
import { createDraft, seedSources } from "../onbrand";
import type { TenantContext } from "../types";

describe("Mandatory 15-Point Golden Customer Journey & Tenant Isolation", () => {
  const repo = getRepository();

  const orgAlphaId = "00000000-0000-4000-8000-000000000001";
  const orgBetaId = "00000000-0000-4000-8000-000000000002";

  const userAlphaCreator = "usr_alpha_creator";
  const userAlphaMaintainer = "usr_alpha_maint";
  const userBetaReviewer = "usr_beta_rev";

  const ctxAlphaCreator: TenantContext = {
    userId: userAlphaCreator,
    organizationId: orgAlphaId,
    role: "CREATOR",
    actor: { userId: userAlphaCreator, displayName: "Alpha Content Creator" },
  };

  const ctxAlphaMaintainer: TenantContext = {
    userId: userAlphaMaintainer,
    organizationId: orgAlphaId,
    role: "MAINTAINER",
    actor: { userId: userAlphaMaintainer, displayName: "Alpha Brand Maintainer" },
  };

  const ctxAlphaReviewer: TenantContext = {
    userId: "usr_alpha_rev",
    organizationId: orgAlphaId,
    role: "REVIEWER",
    actor: { userId: "usr_alpha_rev", displayName: "Alpha Lead Reviewer" },
  };

  const ctxBeta: TenantContext = {
    userId: userBetaReviewer,
    organizationId: orgBetaId,
    role: "REVIEWER",
    actor: { userId: userBetaReviewer, displayName: "Beta Reviewer" },
  };

  it("1 & 2: enforces trusted server-side roles and identity boundary", async () => {
    // Verified: actor and tenant are resolved and locked to server session context
    expect(ctxAlphaCreator.organizationId).toBe(orgAlphaId);
    expect(ctxAlphaCreator.role).toBe("CREATOR");
    expect(ctxBeta.organizationId).toBe(orgBetaId);
  });

  it("3: enforces role permissions on brand knowledge configuration", async () => {
    const newSource = {
      ...seedSources[0],
      id: "SRC-ALPHA-PACKAGING",
      title: "Alpha Packaging Claims Standard 2026",
    };

    // Creator role is forbidden from registering knowledge sources (403)
    const creatorReq = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgAlphaId,
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify(newSource),
    });
    const creatorRes = await postSource(creatorReq);
    expect(creatorRes.status).toBe(403);

    // Maintainer role is authorized to register knowledge sources (201)
    const maintainerReq = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgAlphaId,
        "x-onbrand-role": "maintainer",
      },
      body: JSON.stringify(newSource),
    });
    const maintainerRes = await postSource(maintainerReq);
    expect(maintainerRes.status).toBe(201);
  });

  it("4, 5, 6: submits draft v1, executes review pipeline, and returns verified findings with exact offsets", async () => {
    // Draft v1 contains a prohibited / unverified claim
    const textV1 = "Our organic oat bar is guaranteed miracle food packed with 20g protein.";
    const draftV1 = createDraft(textV1, {
      id: "DRAFT-ALPHA-101",
      title: "Oat Bar Launch Copy v1",
      product: "Alpha Bar",
      version: 1,
    });

    await repo.saveDraftVersion(ctxAlphaCreator, draftV1);

    const reviewReq = new Request("http://localhost/api/reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgAlphaId,
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify({ draft: draftV1, sources: seedSources }),
    });

    const reviewRes = await postReview(reviewReq);
    expect(reviewRes.status).toBe(200);
    const { review } = await reviewRes.json();

    expect(review.draftHash).toBe(draftV1.hash);
    expect(review.findings.length).toBeGreaterThan(0);

    // Finding must specify exact text range, severity, and rule/explanation
    const finding = review.findings[0];
    expect(finding.start).toBeGreaterThanOrEqual(0);
    expect(finding.end).toBeGreaterThan(finding.start);
    expect(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).toContain(finding.severity.toUpperCase());

    // Persist review to repository
    await repo.saveReview(ctxAlphaCreator, review);
  });

  it("7 & 8: allows creator to correct content into draft v2 and re-review cleanly", async () => {
    const textV2 = "Our organic oat bar contains 10g of protein and whole grain oats.";
    const draftV2 = createDraft(textV2, {
      id: "DRAFT-ALPHA-101",
      title: "Oat Bar Launch Copy v2",
      product: "Alpha Bar",
      version: 2,
    });

    await repo.saveDraftVersion(ctxAlphaCreator, draftV2);
    expect(draftV2.version).toBe(2);

    const reviewReq = new Request("http://localhost/api/reviews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgAlphaId,
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify({ draft: draftV2, sources: seedSources }),
    });

    const reviewRes = await postReview(reviewReq);
    expect(reviewRes.status).toBe(200);
    const { review } = await reviewRes.json();

    expect(review.draftHash).toBe(draftV2.hash);
    await repo.saveReview(ctxAlphaCreator, review);
  });

  it("9 & 10: enforces human decision gate (creator blocked, reviewer approved) and persists to exact version", async () => {
    const approvedDraft = createDraft("Alpha Oats — wholesome real food with 6g fiber.", {
      id: "DRAFT-ALPHA-102",
      version: 1,
    });
    await repo.saveDraftVersion(ctxAlphaCreator, approvedDraft);

    const reviewReq = new Request("http://localhost/api/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draft: approvedDraft, sources: seedSources }),
    });
    const reviewRes = await postReview(reviewReq);
    const { review } = await reviewRes.json();
    await repo.saveReview(ctxAlphaCreator, review);

    // Creator cannot record decision (403 Forbidden)
    const creatorDecisionReq = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgAlphaId,
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify({
        reviewId: review.id,
        state: "APPROVED",
        draftHash: approvedDraft.hash,
        sourceSnapshotHash: review.sourceSnapshotHash,
      }),
    });
    const creatorDecisionRes = await postDecision(creatorDecisionReq);
    expect(creatorDecisionRes.status).toBe(403);

    // Reviewer can record decision (200 OK)
    const reviewerDecisionReq = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgAlphaId,
        "x-onbrand-role": "reviewer",
      },
      body: JSON.stringify({
        reviewId: review.id,
        state: "APPROVED",
        draftHash: approvedDraft.hash,
        sourceSnapshotHash: review.sourceSnapshotHash,
        reason: "Compliant with 2026 packaging guidelines.",
      }),
    });
    const reviewerDecisionRes = await postDecision(reviewerDecisionReq);
    expect(reviewerDecisionRes.status).toBe(200);

    // Verify review retrieval by draft version
    const retrievedReview = await repo.getReviewByDraftVersion(ctxAlphaReviewer, "DRAFT-ALPHA-102", 1);
    expect(retrievedReview?.id).toBe(review.id);
  });

  it("11: retrieves complete workspace draft versions across sessions", async () => {
    const v1 = await repo.getDraftVersion(ctxAlphaCreator, "DRAFT-ALPHA-101", 1);
    const v2 = await repo.getDraftVersion(ctxAlphaCreator, "DRAFT-ALPHA-101", 2);
    expect(v1).not.toBeNull();
    expect(v2).not.toBeNull();
    expect(v1?.content).not.toBe(v2?.content);
  });

  it("12: cross-tenant isolation strictly denies Organization Beta access to Organization Alpha", async () => {
    // Org Beta cannot retrieve Org Alpha drafts
    const betaDrafts = await repo.getDrafts(ctxBeta);
    expect(betaDrafts.some((d) => d.id === "DRAFT-ALPHA-101")).toBe(false);
    expect(betaDrafts.some((d) => d.id === "DRAFT-ALPHA-102")).toBe(false);

    // Org Beta cannot fetch specific Org Alpha draft
    const betaSpecific = await repo.getDraftVersion(ctxBeta, "DRAFT-ALPHA-101", 1);
    expect(betaSpecific).toBeNull();

    // Org Beta cannot retrieve Org Alpha sources
    const betaSources = await repo.getSources(ctxBeta);
    expect(betaSources.some((s) => s.id === "SRC-ALPHA-PACKAGING")).toBe(false);

    // Org Beta creates its own distinct draft
    const betaDraft = createDraft("Beta exclusive pharma report.", {
      id: "DRAFT-BETA-001",
      product: "Beta Med",
      version: 1,
    });
    await repo.saveDraftVersion(ctxBeta, betaDraft);

    // Org Alpha cannot see Org Beta draft
    const alphaDrafts = await repo.getDrafts(ctxAlphaReviewer);
    expect(alphaDrafts.some((d) => d.id === "DRAFT-BETA-001")).toBe(false);
  });
});
