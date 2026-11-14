import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError, UnauthorizedError } from "@/lib/server/auth";
import { computePerceptualHash } from "@/lib/visual-analysis";

const assetSchema = z.object({
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\- .]+$/, "Asset name contains invalid characters."),
  sha256: z.string().length(64).regex(/^[0-9a-fA-F]{64}$/, "Invalid SHA-256 hash format."),
  phash: z.string().min(1).max(100).optional(),
  pHash: z.string().min(1).max(100).optional(),
  mimeType: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\-_.]+\/[a-zA-Z0-9\-_.]+$/, "Invalid MIME type format."),
  byteSize: z.number().int().min(1).max(52428800), // Max 50 MB
  approvalState: z.enum(["APPROVED", "PENDING_REVIEW", "REVOKED"]).optional(),
  allowedUsage: z.string().max(500).optional(),
  replacesAssetId: z.string().min(1).max(120).optional(),
  content: z.string().max(70000000).optional(), // Optional base64 binary content for server verification
});

const patchAssetSchema = z.object({
  id: z.string().min(1).max(120),
  approvalState: z.enum(["APPROVED", "PENDING_REVIEW", "REVOKED"]).optional(),
  allowedUsage: z.string().max(500).optional(),
  name: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_\- .]+$/).optional(),
});

// Server-side binary asset store scoped strictly by organizationId
interface StoredAssetBinary {
  organizationId: string;
  assetId: string;
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

const serverAssetBinaryStore = new Map<string, StoredAssetBinary>();

export async function GET(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get("id");
    const binary = searchParams.get("binary") === "true";

    const repo = getRepository();

    if (assetId) {
      const assets = await repo.getAssets(ctx);
      const asset = assets.find((a) => a.id === assetId && a.organizationId === ctx.organizationId);

      if (!asset) {
        return NextResponse.json({ error: "Asset not found in this organization." }, { status: 404 });
      }

      if (binary) {
        const stored = serverAssetBinaryStore.get(`${ctx.organizationId}:${assetId}`);
        if (!stored) {
          return NextResponse.json({ error: "Binary content for this asset is not stored." }, { status: 404 });
        }

        return new Response(new Uint8Array(stored.buffer), {
          status: 200,
          headers: {
            "Content-Type": stored.mimeType,
            "Content-Disposition": `inline; filename="${encodeURIComponent(stored.filename)}"`,
            "Content-Length": stored.buffer.length.toString(),
            "X-Asset-SHA256": asset.sha256,
            "Cache-Control": "private, max-age=3600",
          },
        });
      }

      return NextResponse.json({ asset, organizationId: ctx.organizationId });
    }

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
    let computedPHash = body.phash ?? body.pHash;

    // If binary base64 content is provided, verify cryptographic SHA-256 and pHash server-side
    let binaryBuffer: Buffer | null = null;
    if (body.content) {
      binaryBuffer = Buffer.from(body.content, "base64");
      const computedHash = createHash("sha256").update(binaryBuffer).digest("hex");
      if (computedHash.toLowerCase() !== body.sha256.toLowerCase()) {
        return NextResponse.json(
          { error: "Cryptographic hash mismatch: provided sha256 does not match binary content." },
          { status: 400 }
        );
      }
      if (!computedPHash) {
        computedPHash = computePerceptualHash(binaryBuffer);
      }
    }

    const repo = getRepository();

    // If this asset replaces an existing asset, revoke the previous version and record audit
    if (body.replacesAssetId && repo.updateAsset) {
      const existing = await repo.updateAsset(ctx, body.replacesAssetId, {
        approvalState: "REVOKED",
      });
      if (existing) {
        await repo.recordAuditEvent(ctx, {
          action: "ASSET_SUPERSEDED",
          entityType: "ASSET",
          entityId: body.replacesAssetId,
          metadata: { supersededBy: body.name, previousState: existing.approvalState },
        });
      }
    }

    const saved = await repo.registerAsset(ctx, {
      organizationId: ctx.organizationId,
      name: body.name.trim(),
      sha256: body.sha256.toLowerCase(),
      phash: computedPHash ?? "",
      pHash: computedPHash ?? "",
      mimeType: body.mimeType,
      byteSize: body.byteSize,
      approvalState: body.approvalState ?? "APPROVED",
      allowedUsage: body.allowedUsage,
    });

    // Store binary in server memory store if provided
    if (binaryBuffer) {
      serverAssetBinaryStore.set(`${ctx.organizationId}:${saved.id}`, {
        organizationId: ctx.organizationId,
        assetId: saved.id,
        buffer: binaryBuffer,
        mimeType: body.mimeType,
        filename: saved.name,
      });
    }

    await repo.recordAuditEvent(ctx, {
      action: body.replacesAssetId ? "ASSET_REPLACED" : "ASSET_REGISTERED",
      entityType: "ASSET",
      entityId: saved.id,
      metadata: {
        name: saved.name,
        sha256: saved.sha256,
        replacesAssetId: body.replacesAssetId,
        hasBinary: binaryBuffer !== null,
      },
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

export async function PATCH(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    requireRole(ctx, ["maintainer"]);

    const body = patchAssetSchema.parse(await request.json());
    const repo = getRepository();

    if (!repo.updateAsset) {
      return NextResponse.json({ error: "Repository does not support asset updates." }, { status: 501 });
    }

    const updated = await repo.updateAsset(ctx, body.id, {
      approvalState: body.approvalState,
      allowedUsage: body.allowedUsage,
      name: body.name,
    });

    if (!updated) {
      return NextResponse.json({ error: "Asset not found in this organization." }, { status: 404 });
    }

    const action = body.approvalState === "REVOKED" ? "ASSET_REVOKED" : "ASSET_UPDATED";
    await repo.recordAuditEvent(ctx, {
      action,
      entityType: "ASSET",
      entityId: updated.id,
      metadata: {
        newState: updated.approvalState,
        name: updated.name,
      },
    });

    return NextResponse.json({ asset: updated }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid asset update schema.", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update asset." }, { status: 500 });
  }
}
