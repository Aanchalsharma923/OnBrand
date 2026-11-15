import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError, UnauthorizedError } from "@/lib/server/auth";
import { computePerceptualHash } from "@/lib/visual-analysis";
import {
  storageConfigured,
  uploadAssetToStorage,
  downloadAssetFromStorage,
  deleteAssetFromStorage,
} from "@/lib/server/supabase-storage";

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
import { serverAssetBinaryStore } from "@/lib/server/asset-binary-store";

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
        if (asset.approvalState === "REVOKED") {
          return NextResponse.json(
            { error: "Asset has been revoked and cannot be retrieved." },
            { status: 410 }
          );
        }

        // Try Supabase Storage first (persistent across cold starts)
        let binaryBuffer: Buffer | null = null;
        let binaryMimeType = "application/octet-stream";
        let binaryFilename = asset.name;

        if (storageConfigured() && asset.storageKey) {
          const [, , ...filenameParts] = asset.storageKey.split("/");
          const storedFilename = filenameParts.join("/") || asset.name;
          try {
            binaryBuffer = await downloadAssetFromStorage(
              ctx.organizationId,
              assetId,
              storedFilename
            );
            if (binaryBuffer) {
              binaryMimeType = asset.mimeType ?? "application/octet-stream";
              binaryFilename = storedFilename;
            }
          } catch (dlErr) {
            if (process.env.NODE_ENV === "production") {
              return NextResponse.json({ error: "Failed to download asset from storage." }, { status: 500 });
            }
          }
        }

        // Only fall back to in-memory store in non-production environments
        if (!binaryBuffer && process.env.NODE_ENV !== "production") {
          const stored = serverAssetBinaryStore.get(`${ctx.organizationId}:${assetId}`);
          if (stored) {
            binaryBuffer = stored.buffer;
            binaryMimeType = stored.mimeType;
            binaryFilename = stored.filename;
          }
        }

        if (!binaryBuffer) {
          return NextResponse.json({ error: "Binary content for this asset is not stored." }, { status: 404 });
        }

        return new Response(new Uint8Array(binaryBuffer), {
          status: 200,
          headers: {
            "Content-Type": binaryMimeType,
            "Content-Disposition": `inline; filename="${encodeURIComponent(binaryFilename)}"`,
            "Content-Length": binaryBuffer.length.toString(),
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

    const contentType = request.headers.get("content-type") || "";
    let assetName: string;
    let sha256: string;
    let mimeType: string;
    let byteSize: number;
    let approvalState: "APPROVED" | "PENDING_REVIEW" | "REVOKED" = "APPROVED";
    let allowedUsage: string | undefined;
    let replacesAssetId: string | undefined;
    let binaryBuffer: Buffer | null = null;
    let computedPHash: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Missing file in multipart form data." }, { status: 400 });
      }
      const arrayBuf = await file.arrayBuffer();
      binaryBuffer = Buffer.from(arrayBuf);
      const rawName = ((formData.get("name") as string) || file.name || "uploaded-asset").trim();
      assetName = rawName.replace(/[^a-zA-Z0-9_\- .]/g, "_");
      byteSize = binaryBuffer.length;
      if (byteSize > 52428800) {
        return NextResponse.json({ error: "File exceeds 50 MB limit." }, { status: 400 });
      }
      sha256 = createHash("sha256").update(binaryBuffer).digest("hex");
      const ext = assetName.split(".").pop()?.toLowerCase();
      mimeType =
        file.type ||
        (ext === "pdf"
          ? "application/pdf"
          : ext === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
          ? "image/webp"
          : "application/octet-stream");
      approvalState = (formData.get("approvalState") as any) || "APPROVED";
      allowedUsage = (formData.get("allowedUsage") as string) || undefined;
      replacesAssetId = (formData.get("replacesAssetId") as string) || undefined;
      if (mimeType.startsWith("image/")) {
        try {
          computedPHash = computePerceptualHash(binaryBuffer);
        } catch {
          // perceptual hash fallback
        }
      }
    } else {
      const body = assetSchema.parse(await request.json());
      assetName = body.name.trim();
      sha256 = body.sha256.toLowerCase();
      mimeType = body.mimeType;
      byteSize = body.byteSize;
      approvalState = body.approvalState ?? "APPROVED";
      allowedUsage = body.allowedUsage;
      replacesAssetId = body.replacesAssetId;
      computedPHash = body.phash ?? body.pHash;

      // If binary base64 content is provided, verify cryptographic SHA-256 and pHash server-side
      if (body.content) {
        binaryBuffer = Buffer.from(body.content, "base64");
        const computedHash = createHash("sha256").update(binaryBuffer).digest("hex");
        if (computedHash.toLowerCase() !== sha256) {
          return NextResponse.json(
            { error: "Cryptographic hash mismatch: provided sha256 does not match binary content." },
            { status: 400 }
          );
        }
        if (!computedPHash) {
          computedPHash = computePerceptualHash(binaryBuffer);
        }
      }
    }

    const repo = getRepository();

    // If this asset replaces an existing asset, revoke the previous version and record audit
    if (replacesAssetId && repo.updateAsset) {
      const existing = await repo.updateAsset(ctx, replacesAssetId, {
        approvalState: "REVOKED",
      });
      if (existing) {
        await repo.recordAuditEvent(ctx, {
          action: "ASSET_SUPERSEDED",
          entityType: "ASSET",
          entityId: replacesAssetId,
          metadata: { supersededBy: assetName, previousState: existing.approvalState },
        });
      }
    }

    const saved = await repo.registerAsset(ctx, {
      organizationId: ctx.organizationId,
      name: assetName,
      sha256: sha256.toLowerCase(),
      phash: computedPHash ?? "",
      pHash: computedPHash ?? "",
      mimeType: mimeType,
      byteSize: byteSize,
      approvalState: approvalState,
      allowedUsage: allowedUsage,
    });

    // Store binary: try Supabase Storage first (persistent), fall back to in-memory (ephemeral)
    let storageKey: string | undefined;
    if (binaryBuffer) {
      if (storageConfigured()) {
        try {
          const path = await uploadAssetToStorage(
            ctx.organizationId,
            saved.id,
            binaryBuffer,
            mimeType,
            saved.name
          );
          if (path) {
            storageKey = path;
            // Persist the storageKey on the asset record so retrieval works after cold starts
            if (repo.updateAsset) {
              await repo.updateAsset(ctx, saved.id, { storageKey } as any);
            }
          }
        } catch (storageErr) {
          if (process.env.NODE_ENV === "production") {
            throw new Error(`Production storage upload failed: ${storageErr instanceof Error ? storageErr.message : String(storageErr)}`);
          }
          console.error("Supabase Storage upload failed, falling back to in-memory store:", storageErr);
        }
      } else if (process.env.NODE_ENV === "production") {
        throw new Error("Supabase Storage is unconfigured in production. Assets cannot be persistently stored.");
      }

      // Populate in-memory store for immediate same-process retrieval (test/dev)
      if (process.env.NODE_ENV !== "production" || storageKey) {
        serverAssetBinaryStore.set(`${ctx.organizationId}:${saved.id}`, {
          organizationId: ctx.organizationId,
          assetId: saved.id,
          buffer: binaryBuffer,
          mimeType: mimeType,
          filename: saved.name,
        });
      }
    }

    await repo.recordAuditEvent(ctx, {
      action: replacesAssetId ? "ASSET_REPLACED" : "ASSET_REGISTERED",
      entityType: "ASSET",
      entityId: saved.id,
      metadata: {
        name: saved.name,
        sha256: saved.sha256,
        replacesAssetId: replacesAssetId,
        hasBinary: binaryBuffer !== null,
        storageKey: storageKey ?? null,
        storageBackend: storageKey ? "supabase-storage" : binaryBuffer ? "in-memory" : "none",
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

    // On revocation, attempt to delete the binary from Supabase Storage
    if (body.approvalState === "REVOKED" && storageConfigured() && (updated as any).storageKey) {
      const storagePath = (updated as any).storageKey as string;
      const parts = storagePath.split("/");
      // path is {orgId}/{assetId}/{filename}
      if (parts.length >= 3) {
        const filename = parts.slice(2).join("/");
        try {
          await deleteAssetFromStorage(ctx.organizationId, body.id, filename);
        } catch (delErr) {
          console.error("Storage deletion on revocation failed (non-fatal):", delErr);
        }
      }
    }

    // Always evict from in-memory store and clear storage key on revocation
    if (body.approvalState === "REVOKED") {
      serverAssetBinaryStore.delete(`${ctx.organizationId}:${body.id}`);
      if (repo.updateAsset) {
        await repo.updateAsset(ctx, body.id, { storageKey: null } as any);
      }
    }
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
