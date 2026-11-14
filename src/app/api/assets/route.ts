import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError, UnauthorizedError } from "@/lib/server/auth";

const assetSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\- .]+$/, "Asset name contains invalid characters."),
  sha256: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/, "Invalid SHA-256 hash format."),
  phash: z.string().min(1).max(100).optional(),
  pHash: z.string().min(1).max(100).optional(),
  mimeType: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\-_.]+\/[a-zA-Z0-9\-_.]+$/, "Invalid MIME type format."),
  byteSize: z.number().int().min(1).max(52428800), // Max 50 MB
  approvalState: z.enum(["APPROVED", "PENDING_REVIEW", "REVOKED"]).optional(),
  content: z.string().max(70000000).optional(), // Optional base64 binary content for server verification
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

    // If binary base64 content is provided, verify cryptographic SHA-256 server-side
    if (body.content) {
      const buffer = Buffer.from(body.content, "base64");
      const computedHash = createHash("sha256").update(buffer).digest("hex");
      if (computedHash.toLowerCase() !== body.sha256.toLowerCase()) {
        return NextResponse.json(
          { error: "Cryptographic hash mismatch: provided sha256 does not match binary content." },
          { status: 400 }
        );
      }
    }

    const repo = getRepository();
    const saved = await repo.registerAsset(ctx, {
      organizationId: ctx.organizationId,
      name: body.name.trim(),
      sha256: body.sha256.toLowerCase(),
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
      return NextResponse.json({ error: "Invalid asset schema.", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to register asset." }, { status: 500 });
  }
}
