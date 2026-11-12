import { NextResponse } from "next/server";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const repo = getRepository();
    const limit = Number(new URL(request.url).searchParams.get("limit") || 50);
    const auditLog = await repo.getAuditLog(ctx, limit);
    return NextResponse.json({ auditLog, organizationId: ctx.organizationId });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch audit log." }, { status: 500 });
  }
}

