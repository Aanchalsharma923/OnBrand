import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError } from "@/lib/server/auth";
import { createDraft } from "@/lib/onbrand";

const draftSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  content: z.string().max(30000),
  channel: z.enum(["social", "web", "email", "packaging"]),
  product: z.string().max(200),
  audience: z.string().max(200),
  publicationDate: z.string().date().optional(),
  version: z.number().int().positive().optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const repo = getRepository();
    const drafts = await repo.getDrafts(ctx);
    return NextResponse.json({ drafts, organizationId: ctx.organizationId });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch drafts." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    requireRole(ctx, ["creator", "reviewer", "maintainer"]);

    const body = draftSchema.parse(await request.json());
    const safeDraft = createDraft(body.content, {
      id: body.id,
      title: body.title,
      channel: body.channel,
      product: body.product,
      audience: body.audience,
      publicationDate: body.publicationDate,
      version: body.version,
    });

    const repo = getRepository();
    const result = await repo.saveDraftVersion(ctx, safeDraft);

    await repo.recordAuditEvent(ctx, {
      action: "DRAFT_VERSION_SAVED",
      entityType: "DRAFT",
      entityId: result.draftId,
      metadata: { version: result.version, hash: result.hash },
    });

    return NextResponse.json({
      draft: { ...safeDraft, version: result.version, hash: result.hash },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid draft schema." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save draft." }, { status: 500 });
  }
}
