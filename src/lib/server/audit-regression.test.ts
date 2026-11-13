import { describe, expect, it } from "vitest";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postSource } from "@/app/api/sources/route";
import { getRepository } from "./repository";
import { createDraft, seedSources } from "../onbrand";
import type { TenantContext } from "../types";

describe("Independent Product Audit Regression Suite", () => {
  const repo = getRepository();

  const orgId = "11111111-2222-3333-4444-555555555555";
  const reviewerCtx: TenantContext = {
    userId: "usr_regression_reviewer",
    organizationId: orgId,
    role: "REVIEWER",
    actor: { userId: "usr_regression_reviewer", displayName: "Regression Reviewer" },
  };

  const maintainerCtx: TenantContext = {
    userId: "usr_regression_maintainer",
    organizationId: orgId,
    role: "MAINTAINER",
    actor: { userId: "usr_regression_maintainer", displayName: "Regression Maintainer" },
  };

  const creatorCtx: TenantContext = {
    userId: "usr_regression_creator",
    organizationId: orgId,
    role: "CREATOR",
    actor: { userId: "usr_regression_creator", displayName: "Regression Creator" },
  };

  it("Defect 1 Regression: persists human decision and retrieves it on review query", async () => {
    const draft = createDraft("Nutritious whole grain oats with 5g fiber.", {
      id: "DRAFT-REGRESSION-1",
      version: 1,
    });
    await repo.saveDraftVersion(creatorCtx, draft);

    const validSourceHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const review = {
      id: "REV-REGRESSION-001",
      draftId: draft.id,
      draftVersionId: `${draft.id}-v${draft.version}`,
      draftHash: draft.hash,
      sourceSnapshotHash: validSourceHash,
      createdAt: new Date().toISOString(),
      findings: [],
      comments: [],
    };
    await repo.saveReview(creatorCtx, review);

    // Record decision via API
    const decisionReq = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgId,
        "x-onbrand-role": "reviewer",
      },
      body: JSON.stringify({
        reviewId: review.id,
        state: "APPROVED",
        draftHash: draft.hash,
        sourceSnapshotHash: validSourceHash,
        reason: "Fully compliant with packaging standard.",
      }),
    });

    const res = await postDecision(decisionReq);
    expect(res.status).toBe(200);

    // Retrieve review from repository: decision MUST NOT be undefined!
    const retrieved = await repo.getReviewByDraftVersion(reviewerCtx, draft.id, 1);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.decision).toBeDefined();
    expect(retrieved?.decision?.state).toBe("APPROVED");
    expect(retrieved?.decision?.draftHash).toBe(draft.hash);
    expect(retrieved?.decisionHistory?.length).toBeGreaterThan(0);
  });

  it("Defect 7 Regression: reopening a decision clears active decision and appends to audit history", async () => {
    const draft = createDraft("Nutritious whole grain oats with 5g fiber.", {
      id: "DRAFT-REGRESSION-1",
      version: 1,
    });

    const reopenReq = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgId,
        "x-onbrand-role": "reviewer",
      },
      body: JSON.stringify({
        reviewId: "REV-REGRESSION-001",
        state: "REOPENED",
        draftHash: draft.hash,
        sourceSnapshotHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        reason: "New evidence surfaced requiring review reopen.",
      }),
    });

    const res = await postDecision(reopenReq);
    expect(res.status).toBe(200);

    const retrieved = await repo.getReviewByDraftVersion(reviewerCtx, draft.id, 1);
    expect(retrieved?.decision).toBeUndefined();
    expect(retrieved?.decisionHistory?.some((h) => h.action === "DECISION_REOPENED")).toBe(true);
  });

  it("Defect 3 & 4 Regression: maintainer can register sources while creator is strictly blocked", async () => {
    const source = {
      ...seedSources[0],
      id: "SRC-REGRESSION-MAINTAINER",
      title: "Maintainer Standard 2026",
    };

    // Creator role is forbidden
    const creatorReq = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgId,
        "x-onbrand-role": "creator",
      },
      body: JSON.stringify(source),
    });
    const creatorRes = await postSource(creatorReq);
    expect(creatorRes.status).toBe(403);

    // Maintainer role is allowed
    const maintainerReq = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-tenant": orgId,
        "x-onbrand-role": "maintainer",
      },
      body: JSON.stringify(source),
    });
    const maintainerRes = await postSource(maintainerReq);
    expect(maintainerRes.status).toBe(201);
  });
});
