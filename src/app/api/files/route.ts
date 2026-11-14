import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { resolveTenantContext, requireRole, UnauthorizedError, ForbiddenError } from "@/lib/server/auth";
import { resolveFormat } from "@/lib/format-registry";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB max limit

// In-memory org-scoped binary file store for server persistence
interface StoredFileRecord {
  fileKey: string;
  organizationId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  buffer: Buffer;
  parserVersion: string;
  uploadedAt: string;
}

const serverFileStore = new Map<string, StoredFileRecord>();

export async function POST(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    requireRole(ctx, ["creator", "reviewer", "maintainer"]);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawKey = (formData.get("key") as string) || crypto.randomUUID();

    if (!file) {
      return NextResponse.json({ error: "No file provided in form data." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the 50 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).` },
        { status: 413 }
      );
    }

    // Path traversal and control character sanitization on key and filename
    const safeKey = rawKey.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!safeKey) {
      return NextResponse.json({ error: "Invalid key provided." }, { status: 400 });
    }

    const rawFilename = file.name || "upload.bin";
    const baseName = rawFilename.split(/[/\\]/).pop() || "upload.bin";
    const sanitizedFilename = baseName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentHash = createHash("sha256").update(buffer).digest("hex");

    // Detect format via binary magic bytes
    const headerBytes = new Uint8Array(buffer.subarray(0, 16));
    const format = resolveFormat(sanitizedFilename, file.type, headerBytes);

    const record: StoredFileRecord = {
      fileKey: safeKey,
      organizationId: ctx.organizationId,
      filename: sanitizedFilename,
      mimeType: format.mimeTypes[0] || file.type || "application/octet-stream",
      sizeBytes: buffer.length,
      contentHash,
      buffer,
      parserVersion: format.parserName,
      uploadedAt: new Date().toISOString(),
    };

    serverFileStore.set(`${ctx.organizationId}:${safeKey}`, record);

    return NextResponse.json(
      {
        fileKey: record.fileKey,
        filename: record.filename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        contentHash: record.contentHash,
        parserVersion: record.parserVersion,
        uploadedAt: record.uploadedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Failed to store file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const rawKey = searchParams.get("key");

    if (!rawKey) {
      // List all org files
      const orgFiles: Array<Omit<StoredFileRecord, "buffer">> = [];
      for (const [storeKey, record] of serverFileStore.entries()) {
        if (storeKey.startsWith(`${ctx.organizationId}:`)) {
          const { buffer: _, ...meta } = record;
          orgFiles.push(meta);
        }
      }
      return NextResponse.json({ files: orgFiles, organizationId: ctx.organizationId });
    }

    const safeKey = rawKey.replace(/[^a-zA-Z0-9._-]/g, "");
    // Retrieve specific file scoped strictly to the authenticated organization
    const record = serverFileStore.get(`${ctx.organizationId}:${safeKey}`);

    if (!record || record.organizationId !== ctx.organizationId) {
      return NextResponse.json({ error: "File not found in this organization." }, { status: 404 });
    }

    return new Response(new Uint8Array(record.buffer), {
      status: 200,
      headers: {
        "Content-Type": record.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(record.filename)}"`,
        "Content-Length": record.sizeBytes.toString(),
        "X-Content-Hash": record.contentHash,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Failed to retrieve file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
