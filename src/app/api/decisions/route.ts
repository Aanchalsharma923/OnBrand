import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError, UnauthorizedError } from "@/lib/server/auth";

const decisionSchema = z.object({
  reviewId: z.string().min(1),
  state: z.enum(["APPROVED", "CHANGES_REQUESTED", "REOPENED"]),
  draftHash: z.string().length(64),
  sourceSnapshotHash: z.string().length(64).optional(),
  reason: z.string().max(1000).optional(),
});

export async function POST(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    // Negative role test: Only reviewer or maintainer can record decisions; creators are forbidden.
    requireRole(ctx, ["reviewer", "maintainer"]);

    const body = decisionSchema.parse(await request.json());
    const repo = getRepository();

    // Version integrity & review verification
    const review = await repo.getReviewById(ctx, body.reviewId);
    if (!review) {
      return NextResponse.json({ error: "Review not found for this organization." }, { status: 404 });
    }

    // 1. Verify draft hash matches review.draftHash (stale review protection)
    if (review.draftHash !== body.draftHash) {
      return NextResponse.json(
        { error: "Stale review: Draft content has been modified since review was executed. Re-run review before recording a decision." },
        { status: 409 }
      );
    }

    // 2. If approving, verify there are no unresolved direct contradictions
    if (body.state === "APPROVED") {
      const hasContradiction = review.findings.some((f) => f.evidence_status === "CONTRADICTED");
      if (hasContradiction) {
        return NextResponse.json(
          { error: "Cannot approve review with direct statutory or formulation contradictions. Resolve contradictory claims before approval." },
          { status: 422 }
        );
      }

      // If review has blocking findings (e.g. NEEDS_HUMAN), an explicit rationale/reason is mandatory
      const hasBlocking = review.findings.some((f) => f.blocking_for_review);
      if (hasBlocking && !body.reason?.trim()) {
        return NextResponse.json(
          { error: "Cannot approve review with unverified claims without documenting a review rationale/reason." },
          { status: 422 }
        );
      }
    }

    const decision = {
      state: body.state,
      decision: body.state,
      by: ctx.actor?.displayName ?? ctx.userId ?? "reviewer",
      decidedBy: ctx.actor?.displayName ?? ctx.userId ?? "reviewer",
      at: new Date().toISOString(),
      draftHash: body.draftHash,
      sourceSnapshotHash: body.sourceSnapshotHash ?? "",
      reason: body.reason,
    };

    await repo.recordDecision(ctx, body.reviewId, decision);

    return NextResponse.json({ ok: true, decision }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid decision schema." }, { status: 400 });
    }
    console.error("Decision recording error:", error);
    return NextResponse.json({ error: "Failed to record decision." }, { status: 500 });
  }
}
