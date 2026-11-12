import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { resolveTenantContext, requireRole } from "@/lib/server/auth";
import { resolveFormat } from "@/lib/format-registry";

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
    const key = (formData.get("key") as string) || crypto.randomUUID();

    if (!file) {
      return NextResponse.json({ error: "No file provided in form data." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentHash = createHash("sha256").update(buffer).digest("hex");

    // Detect format via binary magic bytes first
    const headerBytes = new Uint8Array(buffer.subarray(0, 16));
    const format = resolveFormat(file.name, file.type, headerBytes);

    const record: StoredFileRecord = {
      fileKey: key,
      organizationId: ctx.organizationId,
      filename: file.name,
      mimeType: file.type || format.mimeTypes[0] || "application/octet-stream",
      sizeBytes: buffer.length,
      contentHash,
      buffer,
      parserVersion: format.parserName,
      uploadedAt: new Date().toISOString(),
    };

    serverFileStore.set(`${ctx.organizationId}:${key}`, record);
    // Also index by key directly for lookup convenience
    serverFileStore.set(key, record);

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
    const message = error instanceof Error ? error.message : "Failed to store file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
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

    // Retrieve specific file
    const record =
      serverFileStore.get(`${ctx.organizationId}:${key}`) || serverFileStore.get(key);

    if (!record) {
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
    const message = error instanceof Error ? error.message : "Failed to retrieve file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
