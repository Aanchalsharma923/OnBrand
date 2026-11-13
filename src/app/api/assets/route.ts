import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError, UnauthorizedError } from "@/lib/server/auth";

const assetSchema = z.object({
  name: z.string().min(1).max(255),
  sha256: z.string().length(64),
  phash: z.string().min(1).max(100).optional(),
  pHash: z.string().min(1).max(100).optional(),
  mimeType: z.string().min(1).max(100),
  byteSize: z.number().int().nonnegative(),
  approvalState: z.enum(["APPROVED", "PENDING_REVIEW", "REVOKED"]).optional(),
});

export async function GET(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const repo = getRepository();
    const assets = await repo.getAssets(ctx);
    return NextResponse.json({ assets, organizationId: ctx.organizationId });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to fetch assets." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    requireRole(ctx, ["maintainer"]);

    const body = assetSchema.parse(await request.json());
    const repo = getRepository();
    const saved = await repo.registerAsset(ctx, {
      organizationId: ctx.organizationId,
      name: body.name,
      sha256: body.sha256,
      phash: body.phash ?? body.pHash ?? "",
      pHash: body.phash ?? body.pHash ?? "",
      mimeType: body.mimeType,
      byteSize: body.byteSize,
      approvalState: body.approvalState ?? "APPROVED",
    });

    await repo.recordAuditEvent(ctx, {
      action: "ASSET_REGISTERED",
      entityType: "ASSET",
      entityId: saved.id,
      metadata: { name: saved.name, sha256: saved.sha256 },
    });

    return NextResponse.json({ asset: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid asset schema." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to register asset." }, { status: 500 });
  }
}
