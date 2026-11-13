import { describe, expect, it } from "vitest";
import { POST as postDecision } from "@/app/api/decisions/route";
import { POST as postSource } from "@/app/api/sources/route";
import { initialDraft, seedSources } from "@/lib/onbrand";

describe("server-enforced role authorization (RBAC)", () => {
  it("forbids content creator from approving drafts or recording decisions", async () => {
    const request = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-role": "creator", // Creator role
      },
      body: JSON.stringify({
        reviewId: "REV-TEST-001",
        state: "APPROVED",
        draftHash: initialDraft.hash,
      }),
    });

    const response = await postDecision(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("is not authorized");
  });

  it("permits workspace reviewer to record review decisions", async () => {
    const repo = (await import("@/lib/server/repository")).getRepository();
    const { reviewDraft } = await import("@/lib/onbrand");
    const ctx = {
      organizationId: "00000000-0000-0000-0000-000000000001",
      userId: "test-reviewer",
      role: "reviewer" as const,
      actor: { userId: "test-reviewer", displayName: "Workspace Reviewer" },
    };
    const rev = reviewDraft({ draft: initialDraft, sources: seedSources });
    rev.id = "REV-TEST-002";
    rev.draftHash = initialDraft.hash;
    rev.findings = rev.findings.filter((f) => f.evidence_status !== "CONTRADICTED");
    await repo.saveReview(ctx, rev);

    const request = new Request("http://localhost/api/decisions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-role": "reviewer", // Reviewer role
      },
      body: JSON.stringify({
        reviewId: "REV-TEST-002",
        state: "APPROVED",
        draftHash: initialDraft.hash,
        reason: "Evidence verified against approved packaging guideline.",
      }),
    });

    const response = await postDecision(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.decision.by).toBe("Workspace Reviewer");
  });

  it("forbids reviewer from importing or registering new knowledge sources", async () => {
    const newSource = {
      ...seedSources[0],
      id: "SRC-PROPOSED-01",
      title: "Proposed Unverified Guideline",
    };

    const request = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-role": "reviewer", // Reviewers cannot manage sources
      },
      body: JSON.stringify(newSource),
    });

    const response = await postSource(request);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("is not authorized");
  });

  it("permits knowledge maintainer to register new knowledge sources", async () => {
    const newSource = {
      ...seedSources[0],
      id: "SRC-MAINTAINER-01",
      title: "Approved Maintainer Source",
    };

    const request = new Request("http://localhost/api/sources", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-onbrand-role": "maintainer", // Maintainers can manage sources
      },
      body: JSON.stringify(newSource),
    });

    const response = await postSource(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.source.id).toBe("SRC-MAINTAINER-01");
  });
});

