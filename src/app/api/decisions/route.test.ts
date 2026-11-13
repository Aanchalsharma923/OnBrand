import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "./route";
import { getRepository } from "@/lib/server/repository";
import { createDraft, reviewDraft, stableHash } from "@/lib/onbrand";
import { DEMO_ORGS } from "@/lib/server/auth";

describe("POST /api/decisions — Approval & Version Integrity", () => {
  const orgAlphaReviewerHeaders = {
    "x-onbrand-tenant": "org_alpha",
    "x-onbrand-role": "reviewer",
    "Content-Type": "application/json",
  };

  const orgAlphaCreatorHeaders = {
    "x-onbrand-tenant": "org_alpha",
    "x-onbrand-role": "creator",
    "Content-Type": "application/json",
  };

  const reviewerCtx = {
    organizationId: DEMO_ORGS.ALPHA.id,
    userId: "user-reviewer",
    role: "reviewer" as const,
    actor: { userId: "user-reviewer", displayName: "Workspace Reviewer" },
  };

  beforeEach(() => {
    delete process.env.STRICT_AUTH;
  });

  it("1. Rejects unauthenticated requests with HTTP 401 when strict auth is enabled", async () => {
    process.env.STRICT_AUTH = "true";
    const req = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: {
        "x-onbrand-tenant": "custom_tenant_unauth",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reviewId: "REV-1",
        state: "APPROVED",
        draftHash: stableHash("test"),
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("2. Rejects creators with HTTP 403 Forbidden", async () => {
    const req = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: orgAlphaCreatorHeaders,
      body: JSON.stringify({
        reviewId: "REV-1",
        state: "APPROVED",
        draftHash: stableHash("test"),
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("not authorized");
  });

  it("3. Rejects nonexistent review with HTTP 404 Not Found", async () => {
    const req = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: orgAlphaReviewerHeaders,
      body: JSON.stringify({
        reviewId: "NONEXISTENT-REV-999",
        state: "APPROVED",
        draftHash: stableHash("test"),
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Review not found");
  });

  it("4. Rejects approval with HTTP 422 if review has unresolved blocking issues", async () => {
    const repo = getRepository();
    // Create a draft and review with a blocking contradiction
    const draft = createDraft("Sample Foods Oat Bites contain zero sugar.", {
      channel: "social",
      product: "Sample Foods Oat Bites",
    });
    const sources = await repo.getSources(reviewerCtx);
    const review = reviewDraft({ draft, sources });
    expect(review.findings.some((f) => f.blocking_for_review)).toBe(true);

    await repo.saveReview(reviewerCtx, review);

    const req = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: orgAlphaReviewerHeaders,
      body: JSON.stringify({
        reviewId: review.id,
        state: "APPROVED",
        draftHash: draft.hash,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/contradiction|blocking/i);
  });

  it("5. Rejects approval with HTTP 409 if draft was modified (stale draft hash)", async () => {
    const repo = getRepository();
    const draft = createDraft("Sample Foods Oat Bites contain 4g of sugar per serving.", {
      channel: "social",
      product: "Sample Foods Oat Bites",
    });
    const sources = await repo.getSources(reviewerCtx);
    const review = reviewDraft({ draft, sources });
    await repo.saveReview(reviewerCtx, review);

    // Mismatched draft hash simulates content edited after review
    const modifiedHash = stableHash("Different modified content text");

    const req = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: orgAlphaReviewerHeaders,
      body: JSON.stringify({
        reviewId: review.id,
        state: "APPROVED",
        draftHash: modifiedHash,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain("Stale review");
  });

  it("6. Allows reviewer to approve clean review with matching draft hash", async () => {
    const repo = getRepository();
    const cleanDraft = createDraft("Sample Foods Oat Bites contain 4g of sugar per serving.", {
      channel: "social",
      product: "Sample Foods Oat Bites",
    });
    const sources = await repo.getSources(reviewerCtx);
    const review = reviewDraft({ draft: cleanDraft, sources });
    // Remove any blocking finding
    review.findings = review.findings.filter((f) => !f.blocking_for_review);

    await repo.saveReview(reviewerCtx, review);

    const req = new Request("http://localhost:3000/api/decisions", {
      method: "POST",
      headers: orgAlphaReviewerHeaders,
      body: JSON.stringify({
        reviewId: review.id,
        state: "APPROVED",
        draftHash: cleanDraft.hash,
        reason: "Compliance verified by reviewer",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.decision.state).toBe("APPROVED");
    expect(data.decision.draftHash).toBe(cleanDraft.hash);
  });
});
