import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError } from "@/lib/server/auth";

const decisionSchema = z.object({
  reviewId: z.string().min(1),
  state: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
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
    const decision = {
      state: body.state,
      decision: body.state,
      by: ctx.actor.displayName,
      decidedBy: ctx.actor.displayName,
      at: new Date().toISOString(),
      draftHash: body.draftHash,
      sourceSnapshotHash: body.sourceSnapshotHash ?? "",
      reason: body.reason,
    };

    const repo = getRepository();
    await repo.recordDecision(ctx, body.reviewId, decision);

    return NextResponse.json({ ok: true, decision }, { status: 200 });
  } catch (error) {
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
