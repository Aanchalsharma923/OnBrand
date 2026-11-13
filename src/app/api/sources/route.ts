import { NextResponse } from "next/server";
import { z } from "zod";
import { getRepository } from "@/lib/server/repository";
import { resolveTenantContext, requireRole, ForbiddenError } from "@/lib/server/auth";
import { sourceInjectionWarnings, type Source } from "@/lib/onbrand";

const factSchema = z.object({
  id: z.string().max(120),
  subject: z.string().max(240),
  attribute: z.string().max(160),
  value: z.string().max(500),
  unit: z.string().max(40).optional(),
  statement: z.string().max(800),
  sourceId: z.string().max(120),
});

const sourceSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  kind: z.enum(["PRODUCT_FACT", "APPROVED_CLAIM", "GUIDELINE", "DISCLOSURE"]),
  authority: z.number().min(0).max(100),
  version: z.number().int().positive(),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional(),
  revokedAt: z.string().optional(),
  channels: z.array(z.string().max(40)).max(20),
  owner: z.string().max(160),
  approvalState: z.enum(["APPROVED", "PENDING_REVIEW", "REVOKED"]),
  facts: z.array(factSchema).max(1000),
});

export async function GET(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    const repo = getRepository();
    const sources = await repo.getSources(ctx);
    return NextResponse.json({ sources, organizationId: ctx.organizationId });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch sources." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    // Negative role enforcement: Only maintainers can import or register knowledge sources
    requireRole(ctx, ["maintainer"]);

    const body = sourceSchema.parse(await request.json());
    const source = body as Source;

    // Quarantining prompt injection
    const warnings = sourceInjectionWarnings(source);
    if (warnings.length > 0) {
      return NextResponse.json(
        { error: "Knowledge source contains instruction-like content and cannot be imported." },
        { status: 400 },
      );
    }

    const repo = getRepository();
    const saved = await repo.createSource(ctx, source);

    await repo.recordAuditEvent(ctx, {
      actorId: ctx.actor?.userId ?? ctx.userId ?? "system",
      action: "SOURCE_CREATED",
      entityType: "SOURCE",
      entityId: saved.id,
      metadata: { title: saved.title, authority: saved.authority, factsCount: saved.facts.length },
    });

    return NextResponse.json({ source: saved }, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid source schema." }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save source." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await resolveTenantContext(request);
    requireRole(ctx, ["maintainer"]);

    const body = z.object({
      id: z.string().min(1),
      status: z.enum(["APPROVED", "REVOKED"]),
    }).parse(await request.json());

    const repo = getRepository();
    await repo.updateSourceStatus(ctx, body.id, body.status);

    await repo.recordAuditEvent(ctx, {
      actorId: ctx.actor?.userId ?? ctx.userId ?? "system",
      action: `SOURCE_STATUS_${body.status}`,
      entityType: "SOURCE",
      entityId: body.id,
      metadata: { status: body.status },
    });

    return NextResponse.json({ ok: true, id: body.id, status: body.status });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to update source status." }, { status: 500 });
  }
}
