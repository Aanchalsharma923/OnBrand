import crypto from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { seedSources, type Draft, type Fact, type Finding, type Review, type Source } from "@/lib/onbrand";
import * as schema from "@/lib/schema";
import { databaseConfigured, withOrganizationScope } from "./db";
import type { TenantContext, AssetRecord, AuditEvent, ReviewDecision, OnBrandRepository } from "@/lib/types";

export type { TenantContext, TenantRole, AssetRecord, AuditEvent, ReviewDecision, OnBrandRepository } from "@/lib/types";

function toValidUuid(id: string): string {
  if (!id) return "00000000-0000-4000-8000-000000000000";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  const hash = crypto.createHash("sha256").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const ALPHA_ORG_ID = "00000000-0000-0000-0000-000000000001";

/**
 * In-memory repository with strict tenant isolation.
 * Used for unit testing and local offline execution.
 */
export class InMemoryRepository implements OnBrandRepository {
  private sources = new Map<string, Source[]>();
  private drafts = new Map<string, Map<string, Draft[]>>(); // orgId -> draftId -> versions
  private reviews = new Map<string, Review[]>();
  private decisions = new Map<string, ReviewDecision[]>();
  private auditEvents = new Map<string, AuditEvent[]>();
  private assets = new Map<string, AssetRecord[]>();

  constructor() {
    // Org Alpha is seeded by default with demo knowledge
    this.sources.set(ALPHA_ORG_ID, [...seedSources]);
  }

  async getSources(ctx: TenantContext): Promise<Source[]> {
    return this.sources.get(ctx.organizationId) ?? [];
  }

  async getSourceById(ctx: TenantContext, id: string): Promise<Source | null> {
    const orgSources = this.sources.get(ctx.organizationId) ?? [];
    return orgSources.find((s) => s.id === id) ?? null;
  }

  async createSource(ctx: TenantContext, source: Omit<Source, "id"> | Source): Promise<Source> {
    const id = "id" in source && source.id ? source.id : crypto.randomUUID();
    const fullSource: Source = {
      ...source,
      id,
      facts: (source.facts ?? []).map((f, i) => ({
        ...f,
        id: f.id || `${id}-F${i + 1}`,
        sourceId: id,
      })),
    };

    const orgSources = this.sources.get(ctx.organizationId) ?? [];
    orgSources.push(fullSource);
    this.sources.set(ctx.organizationId, orgSources);
    return fullSource;
  }

  async updateSourceStatus(ctx: TenantContext, id: string, status: "APPROVED" | "REVOKED"): Promise<void> {
    const orgSources = this.sources.get(ctx.organizationId) ?? [];
    const target = orgSources.find((s) => s.id === id);
    if (target) {
      target.approvalState = status;
      if (status === "REVOKED") target.revokedAt = new Date().toISOString();
    }
  }

  async searchFacts(ctx: TenantContext, query: string, channel: string, date: string): Promise<Fact[]> {
    const sources = await this.getSources(ctx);
    const approved = sources.filter((s) => {
      if (s.approvalState !== "APPROVED") return false;
      if (s.revokedAt) return false;
      if (date && s.effectiveFrom > date) return false;
      if (date && s.effectiveTo && s.effectiveTo < date) return false;
      if (channel && s.channels?.length && !s.channels.includes(channel)) return false;
      return true;
    });

    const facts = approved.flatMap((s) => s.facts ?? []);
    if (!query.trim()) return facts;

    const lowerQuery = query.toLowerCase();
    return facts.filter((f) =>
      f.statement.toLowerCase().includes(lowerQuery) ||
      f.subject.toLowerCase().includes(lowerQuery) ||
      f.attribute.toLowerCase().includes(lowerQuery) ||
      f.value.toLowerCase().includes(lowerQuery),
    );
  }

  async getDrafts(ctx: TenantContext): Promise<Draft[]> {
    const orgDraftsMap = this.drafts.get(ctx.organizationId);
    if (!orgDraftsMap) return [];
    const results: Draft[] = [];
    const allVersions = Array.from(orgDraftsMap.values());
    for (const versions of allVersions) {
      if (versions.length) {
        results.push(versions[versions.length - 1]);
      }
    }
    return results;
  }

  async getDraftVersion(ctx: TenantContext, draftId: string, version: number): Promise<Draft | null> {
    const orgDraftsMap = this.drafts.get(ctx.organizationId);
    if (!orgDraftsMap) return null;
    const versions = orgDraftsMap.get(draftId);
    if (!versions) return null;
    return versions.find((d) => d.version === version) ?? null;
  }

  async saveDraftVersion(ctx: TenantContext, draft: Draft): Promise<{ draftId: string; version: number; hash: string }> {
    let orgDraftsMap = this.drafts.get(ctx.organizationId);
    if (!orgDraftsMap) {
      orgDraftsMap = new Map();
      this.drafts.set(ctx.organizationId, orgDraftsMap);
    }
    const versions = orgDraftsMap.get(draft.id) ?? [];
    const filtered = versions.filter((d) => d.version !== draft.version);
    filtered.push(draft);
    orgDraftsMap.set(draft.id, filtered);
    return { draftId: draft.id, version: draft.version, hash: draft.hash };
  }

  async saveReview(ctx: TenantContext, review: Review): Promise<void> {
    const orgReviews = this.reviews.get(ctx.organizationId) ?? [];
    orgReviews.push(review);
    this.reviews.set(ctx.organizationId, orgReviews);
  }

  async getReviewByDraftVersion(ctx: TenantContext, draftVersionIdOrDraftId: string, version?: number): Promise<Review | null> {
    const orgReviews = this.reviews.get(ctx.organizationId) ?? [];
    const rev = orgReviews.find(
      (r) =>
        r.draftVersionId === draftVersionIdOrDraftId ||
        (r.draftId === draftVersionIdOrDraftId && (version === undefined || r.draftVersionId.endsWith(`v${version}`))),
    ) ?? null;
    if (!rev) return null;
    if (!rev.decision) {
      const orgDecisions = this.decisions.get(ctx.organizationId) ?? [];
      const matchDec = orgDecisions
        .filter((d) => d.draftHash === rev.draftHash)
        .slice(-1)[0];
      if (matchDec && matchDec.state !== "REOPENED") {
        rev.decision = {
          state: matchDec.state,
          by: matchDec.by ?? "reviewer",
          at: matchDec.at,
          draftHash: matchDec.draftHash,
          sourceSnapshotHash: matchDec.sourceSnapshotHash,
        };
      }
    }
    return rev;
  }

  async getReviewById(ctx: TenantContext, reviewId: string): Promise<Review | null> {
    const orgReviews = this.reviews.get(ctx.organizationId) ?? [];
    const rev = orgReviews.find((r) => r.id === reviewId || r.draftHash === reviewId) ?? null;
    if (!rev) return null;
    if (!rev.decision) {
      const orgDecisions = this.decisions.get(ctx.organizationId) ?? [];
      const matchDec = orgDecisions
        .filter((d) => d.draftHash === rev.draftHash)
        .slice(-1)[0];
      if (matchDec && matchDec.state !== "REOPENED") {
        rev.decision = {
          state: matchDec.state,
          by: matchDec.by ?? "reviewer",
          at: matchDec.at,
          draftHash: matchDec.draftHash,
          sourceSnapshotHash: matchDec.sourceSnapshotHash,
        };
      }
    }
    return rev;
  }

  async recordDecision(ctx: TenantContext, reviewId: string, decision: ReviewDecision): Promise<void> {
    const orgDecisions = this.decisions.get(ctx.organizationId) ?? [];
    const decisionRecord: ReviewDecision = {
      ...decision,
      at: decision.at ?? new Date().toISOString(),
    };
    orgDecisions.push(decisionRecord);
    this.decisions.set(ctx.organizationId, orgDecisions);

    // Synchronize review object in in-memory store so retrieved reviews have decision history
    const orgReviews = this.reviews.get(ctx.organizationId) ?? [];
    const targetReview = orgReviews.find((r) => r.id === reviewId || r.draftHash === decision.draftHash);
    if (targetReview) {
      if (decision.state === "REOPENED") {
        targetReview.decision = undefined;
      } else {
        targetReview.decision = {
          state: decision.state,
          by: decision.by ?? "reviewer",
          at: decisionRecord.at,
          draftHash: decisionRecord.draftHash,
          sourceSnapshotHash: decisionRecord.sourceSnapshotHash,
        };
      }
      targetReview.decisionHistory = [
        ...(targetReview.decisionHistory ?? []),
        {
          action: decision.state === "REOPENED" ? "DECISION_REOPENED" : "DECISION_RECORDED",
          state: decision.state === "REOPENED" ? undefined : decision.state,
          by: decisionRecord.by ?? "reviewer",
          at: decisionRecord.at,
          draftHash: decisionRecord.draftHash,
          sourceSnapshotHash: decisionRecord.sourceSnapshotHash ?? "",
        },
      ];
    }

    // Record immutable audit event
    const actionState = decision.state ?? "RECORDED";
    await this.recordAuditEvent(ctx, {
      organizationId: ctx.organizationId,
      actorId: ctx.actor?.userId ?? ctx.userId ?? decision.by ?? "unknown",
      action: `DECISION_${actionState}`,
      entityType: "review",
      entityId: reviewId,
      metadata: {
        draftHash: decision.draftHash,
        sourceSnapshotHash: decision.sourceSnapshotHash,
        reason: decision.reason,
      },
    });
  }

  async recordAuditEvent(ctx: TenantContext, event: AuditEvent): Promise<void> {
    const orgAudits = this.auditEvents.get(ctx.organizationId) ?? [];
    orgAudits.unshift({
      ...event,
      id: event.id ?? crypto.randomUUID(),
      organizationId: ctx.organizationId,
      createdAt: event.createdAt ?? new Date().toISOString(),
    });
    this.auditEvents.set(ctx.organizationId, orgAudits);
  }

  async getAuditLog(ctx: TenantContext, limit = 100): Promise<AuditEvent[]> {
    const orgAudits = this.auditEvents.get(ctx.organizationId) ?? [];
    return orgAudits.slice(0, limit);
  }

  async registerAsset(
    ctx: TenantContext,
    asset: AssetRecord | Omit<AssetRecord, "id" | "createdAt">,
  ): Promise<AssetRecord> {
    const fullAsset: AssetRecord = {
      ...asset,
      id: "id" in asset && asset.id ? asset.id : crypto.randomUUID(),
      organizationId: ctx.organizationId,
      createdAt: "createdAt" in asset && asset.createdAt ? asset.createdAt : new Date().toISOString(),
    };
    const orgAssets = this.assets.get(ctx.organizationId) ?? [];
    orgAssets.push(fullAsset);
    this.assets.set(ctx.organizationId, orgAssets);
    return fullAsset;
  }

  async getAssets(ctx: TenantContext): Promise<AssetRecord[]> {
    return this.assets.get(ctx.organizationId) ?? [];
  }

  async updateAsset(
    ctx: TenantContext,
    assetId: string,
    updates: Partial<AssetRecord>
  ): Promise<AssetRecord | null> {
    const orgAssets = this.assets.get(ctx.organizationId) ?? [];
    const idx = orgAssets.findIndex((a) => a.id === assetId);
    if (idx === -1) return null;
    const updated = { ...orgAssets[idx], ...updates };
    orgAssets[idx] = updated;
    this.assets.set(ctx.organizationId, orgAssets);
    return updated;
  }
}

function isDatabaseConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ("name" in err && (err.name === "OrganizationAccessError" || err.name === "ForbiddenError" || err.name === "UnauthorizedError")) {
    return false;
  }
  const msg = (err as Error).message || "";
  const code = (err as { code?: string }).code || "";
  return (
    code === "28P01" ||
    code === "XX000" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    msg.includes("password authentication failed") ||
    msg.includes("ECIRCUITBREAKER") ||
    msg.includes("authentication failures") ||
    msg.includes("temporarily blocked") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("connect_timeout") ||
    msg.includes("Connection terminated") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("Failed query")
  );
}

/**
 * PostgreSQL + Drizzle ORM implementation of OnBrandRepository.
 * Every query is executed inside withOrganizationScope enforcing RLS.
 */
export class DrizzleOnBrandRepository implements OnBrandRepository {
  private inMemoryFallback = new InMemoryRepository();

  private async executeWithFallback<T>(
    ctx: TenantContext,
    dbAction: () => Promise<T>,
    fallbackAction: () => Promise<T>,
  ): Promise<T> {
    if (!databaseConfigured()) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "Production database unavailable: DATABASE_URL is not configured. OnBrand requires persistent PostgreSQL storage in production."
        );
      }
      return fallbackAction();
    }
    try {
      return await dbAction();
    } catch (err: unknown) {
      if (isDatabaseConnectionError(err)) {
        if (process.env.NODE_ENV === "production") {
          const sanitizedErr = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          console.error(
            `[FATAL] Production database connection error: ${sanitizedErr}. In-memory fallback is disabled in production to prevent data loss.`
          );
          throw new Error(
            "Production database connection failure: Persistent database operation could not be completed. In-memory fallback is disabled in production."
          );
        }
        return fallbackAction();
      }
      throw err;
    }
  }

  async getSources(ctx: TenantContext): Promise<Source[]> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const sourceRows = await tx
            .select()
            .from(schema.sources)
            .where(eq(schema.sources.organizationId, ctx.organizationId));

          const results: Source[] = [];
          for (const row of sourceRows) {
            const factRows = await tx
              .select()
              .from(schema.facts)
              .where(and(
                eq(schema.facts.organizationId, ctx.organizationId),
                eq(schema.facts.sourceId, row.id),
              ));

            results.push({
              id: row.sourceKey || row.id,
              title: row.title,
              kind: row.kind as Source["kind"],
              authority: row.authority,
              version: row.version,
              effectiveFrom: row.effectiveFrom,
              effectiveTo: row.effectiveTo ?? undefined,
              revokedAt: row.revokedAt ? row.revokedAt.toISOString() : undefined,
              approvalState: row.approvalState as Source["approvalState"],
              channels: row.channels ?? [],
              owner: row.owner,
              facts: factRows.map((f: typeof schema.facts.$inferSelect) => ({
                id: f.id,
                subject: f.subject,
                attribute: f.attribute,
                value: f.value,
                unit: f.unit ?? undefined,
                statement: f.statement,
                sourceId: row.id,
              })),
            });
          }
          return results;
        }),
      () => this.inMemoryFallback.getSources(ctx),
    );
  }

  async getSourceById(ctx: TenantContext, id: string): Promise<Source | null> {
    return this.executeWithFallback<Source | null>(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
          const idCondition = isUuid
            ? or(eq(schema.sources.id, id), eq(schema.sources.sourceKey, id))
            : eq(schema.sources.sourceKey, id);
          const rows = await tx
            .select()
            .from(schema.sources)
            .where(and(
              eq(schema.sources.organizationId, ctx.organizationId),
              idCondition,
            ))
            .limit(1);

          if (!rows.length) return null;
          const row = rows[0];

          const factRows = await tx
            .select()
            .from(schema.facts)
            .where(and(
              eq(schema.facts.organizationId, ctx.organizationId),
              eq(schema.facts.sourceId, row.id),
            ));

          return {
            id: row.sourceKey || row.id,
            title: row.title,
            kind: row.kind as Source["kind"],
            authority: row.authority,
            version: row.version,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo ?? undefined,
            revokedAt: row.revokedAt ? row.revokedAt.toISOString() : undefined,
            approvalState: row.approvalState as Source["approvalState"],
            channels: row.channels ?? [],
            owner: row.owner,
            facts: factRows.map((f: typeof schema.facts.$inferSelect) => ({
              id: f.id,
              subject: f.subject,
              attribute: f.attribute,
              value: f.value,
              unit: f.unit ?? undefined,
              statement: f.statement,
              sourceId: row.sourceKey || row.id,
            })),
          };
        }),
      () => this.inMemoryFallback.getSourceById(ctx, id),
    );
  }

  async createSource(ctx: TenantContext, source: Omit<Source, "id"> | Source): Promise<Source> {
    const id = "id" in source && source.id ? source.id : crypto.randomUUID();
    const fullSource: Source = {
      ...source,
      id,
      facts: (source.facts ?? []).map((f, i) => ({
        ...f,
        id: f.id || `${id}-F${i + 1}`,
        sourceId: id,
      })),
    };

    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
          const sourceDbId = isUuid ? id : crypto.randomUUID();
          await tx.insert(schema.sources).values({
            id: sourceDbId,
            organizationId: ctx.organizationId,
            sourceKey: fullSource.id,
            title: fullSource.title,
            kind: fullSource.kind,
            authority: fullSource.authority,
            version: fullSource.version,
            effectiveFrom: fullSource.effectiveFrom,
            effectiveTo: fullSource.effectiveTo ?? null,
            revokedAt: fullSource.revokedAt ? new Date(fullSource.revokedAt) : null,
            approvalState: fullSource.approvalState,
            channels: fullSource.channels,
            owner: fullSource.owner,
          });

          if (fullSource.facts.length > 0) {
            await tx.insert(schema.facts).values(
              fullSource.facts.map((f) => ({
                id: f.id.length === 36 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(f.id) ? f.id : crypto.randomUUID(),
                organizationId: ctx.organizationId,
                sourceId: sourceDbId,
                subject: f.subject,
                attribute: f.attribute,
                value: f.value,
                unit: f.unit ?? null,
                statement: f.statement,
              })),
            );
          }

          return fullSource;
        }),
      () => this.inMemoryFallback.createSource(ctx, source),
    );
  }

  async updateSourceStatus(ctx: TenantContext, id: string, status: "APPROVED" | "REVOKED"): Promise<void> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
          const idCondition = isUuid
            ? or(eq(schema.sources.id, id), eq(schema.sources.sourceKey, id))
            : eq(schema.sources.sourceKey, id);
          await tx
            .update(schema.sources)
            .set({
              approvalState: status,
              revokedAt: status === "REVOKED" ? new Date() : null,
            })
            .where(and(
              eq(schema.sources.organizationId, ctx.organizationId),
              idCondition,
            ));
        }),
      () => this.inMemoryFallback.updateSourceStatus(ctx, id, status),
    );
  }

  async searchFacts(ctx: TenantContext, query: string, channel: string, date: string): Promise<Fact[]> {
    return this.executeWithFallback<Fact[]>(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          // PostgreSQL full-text search with tsvector and GIN index
          const trimmedQuery = query.trim();
          const effectiveDate = date || new Date().toISOString().slice(0, 10);

          let searchSql;
          if (trimmedQuery) {
            searchSql = sql`
              SELECT 
                f.id,
                f.source_id AS "sourceId",
                f.subject,
                f.attribute,
                f.value,
                f.unit,
                f.statement,
                ts_rank(to_tsvector('simple', f.statement), plainto_tsquery('simple', ${trimmedQuery})) AS rank,
                s.authority
              FROM facts f
              JOIN sources s ON f.source_id = s.id AND f.organization_id = s.organization_id
              WHERE f.organization_id = ${ctx.organizationId}::uuid
                AND s.approval_state = 'APPROVED'
                AND s.revoked_at IS NULL
                AND s.effective_from <= ${effectiveDate}::date
                AND (s.effective_to IS NULL OR s.effective_to >= ${effectiveDate}::date)
                ${channel ? sql`AND (s.channels @> jsonb_build_array(${channel}) OR jsonb_array_length(s.channels) = 0)` : sql``}
                AND (
                  to_tsvector('simple', f.statement) @@ plainto_tsquery('simple', ${trimmedQuery})
                  OR f.statement ILIKE ${'%' + trimmedQuery + '%'}
                  OR f.subject ILIKE ${'%' + trimmedQuery + '%'}
                  OR f.attribute ILIKE ${'%' + trimmedQuery + '%'}
                  OR f.value ILIKE ${'%' + trimmedQuery + '%'}
                )
              ORDER BY rank DESC, s.authority DESC, f.created_at ASC
            `;
          } else {
            searchSql = sql`
              SELECT 
                f.id,
                f.source_id AS "sourceId",
                f.subject,
                f.attribute,
                f.value,
                f.unit,
                f.statement,
                s.authority
              FROM facts f
              JOIN sources s ON f.source_id = s.id AND f.organization_id = s.organization_id
              WHERE f.organization_id = ${ctx.organizationId}::uuid
                AND s.approval_state = 'APPROVED'
                AND s.revoked_at IS NULL
                AND s.effective_from <= ${effectiveDate}::date
                AND (s.effective_to IS NULL OR s.effective_to >= ${effectiveDate}::date)
                ${channel ? sql`AND (s.channels @> jsonb_build_array(${channel}) OR jsonb_array_length(s.channels) = 0)` : sql``}
              ORDER BY s.authority DESC, f.created_at ASC
            `;
          }

          const rows = await tx.execute(searchSql);
          const facts: Fact[] = (rows as any[]).map((r): Fact => ({
            id: r.id,
            sourceId: r.sourceId,
            subject: r.subject,
            attribute: r.attribute,
            value: r.value,
            unit: r.unit ?? undefined,
            statement: r.statement,
          }));
          return facts;
        }),
      () => this.inMemoryFallback.searchFacts(ctx, query, channel, date),
    );
  }

  async getDrafts(ctx: TenantContext): Promise<Draft[]> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const draftsRows = await tx
            .select()
            .from(schema.drafts)
            .where(eq(schema.drafts.organizationId, ctx.organizationId))
            .orderBy(desc(schema.drafts.updatedAt));

          const drafts: Draft[] = [];
          for (const d of draftsRows) {
            const versionRows = await tx
              .select()
              .from(schema.draftVersions)
              .where(and(
                eq(schema.draftVersions.organizationId, ctx.organizationId),
                eq(schema.draftVersions.draftId, d.id),
                eq(schema.draftVersions.version, d.currentVersion),
              ))
              .limit(1);

            const version = versionRows[0];
            drafts.push({
              id: d.id,
              title: d.title,
              content: version?.content ?? "",
              channel: d.channel,
              product: d.product,
              audience: d.audience,
              publicationDate: d.publicationDate,
              updatedAt: d.updatedAt.toISOString(),
              version: d.currentVersion,
              hash: version?.contentHash ?? "",
            });
          }
          return drafts;
        }),
      () => this.inMemoryFallback.getDrafts(ctx),
    );
  }

  async getDraftVersion(ctx: TenantContext, draftId: string, version: number): Promise<Draft | null> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const targetDraftId = toValidUuid(draftId);
          const draftsRows = await tx
            .select()
            .from(schema.drafts)
            .where(and(
              eq(schema.drafts.organizationId, ctx.organizationId),
              eq(schema.drafts.id, targetDraftId),
            ))
            .limit(1);

          if (!draftsRows.length) return null;
          const d = draftsRows[0];

          const versionRows = await tx
            .select()
            .from(schema.draftVersions)
            .where(and(
              eq(schema.draftVersions.organizationId, ctx.organizationId),
              eq(schema.draftVersions.draftId, targetDraftId),
              eq(schema.draftVersions.version, version),
            ))
            .limit(1);

          if (!versionRows.length) return null;
          const v = versionRows[0];

          return {
            id: draftId,
            title: d.title,
            content: v.content,
            channel: d.channel,
            product: d.product,
            audience: d.audience,
            publicationDate: d.publicationDate,
            updatedAt: d.updatedAt.toISOString(),
            version: v.version,
            hash: v.contentHash,
          };
        }),
      () => this.inMemoryFallback.getDraftVersion(ctx, draftId, version),
    );
  }

  async saveDraftVersion(ctx: TenantContext, draft: Draft): Promise<{ draftId: string; version: number; hash: string }> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const userId = ctx.actor?.userId ?? ctx.userId ?? "creator";
          const targetDraftId = toValidUuid(draft.id);
          await tx
            .insert(schema.drafts)
            .values({
              id: targetDraftId,
              organizationId: ctx.organizationId,
              title: draft.title,
              channel: draft.channel,
              product: draft.product,
              audience: draft.audience,
              publicationDate: draft.publicationDate,
              currentVersion: draft.version,
              createdBy: userId,
            })
            .onConflictDoUpdate({
              target: schema.drafts.id,
              set: {
                title: draft.title,
                channel: draft.channel,
                product: draft.product,
                audience: draft.audience,
                publicationDate: draft.publicationDate,
                currentVersion: draft.version,
                updatedAt: new Date(),
              },
            });

          await tx
            .insert(schema.draftVersions)
            .values({
              organizationId: ctx.organizationId,
              draftId: targetDraftId,
              version: draft.version,
              content: draft.content,
              contentHash: draft.hash,
              createdBy: userId,
            })
            .onConflictDoUpdate({
              target: [schema.draftVersions.organizationId, schema.draftVersions.draftId, schema.draftVersions.version],
              set: {
                content: draft.content,
                contentHash: draft.hash,
              },
            });

          return { draftId: draft.id, version: draft.version, hash: draft.hash };
        }),
      () => this.inMemoryFallback.saveDraftVersion(ctx, draft),
    );
  }

  async saveReview(ctx: TenantContext, review: Review): Promise<void> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const targetReviewId = toValidUuid(review.id);
          review.id = targetReviewId;

          const targetDraftId = toValidUuid(review.draftId);
          let targetDraftVersionId = toValidUuid(review.draftVersionId || `${review.draftId}-v1`);

          // Ensure parent draft exists in schema.drafts
          await tx
            .insert(schema.drafts)
            .values({
              id: targetDraftId,
              organizationId: ctx.organizationId,
              title: "Reviewed Draft",
              channel: "web",
              product: "General",
              audience: "General",
              publicationDate: new Date().toISOString().slice(0, 10),
              currentVersion: 1,
              createdBy: ctx.userId ?? "system",
            })
            .onConflictDoNothing();

          const existingVersion = await tx
            .select({ id: schema.draftVersions.id })
            .from(schema.draftVersions)
            .where(
              and(
                eq(schema.draftVersions.organizationId, ctx.organizationId),
                eq(schema.draftVersions.draftId, targetDraftId),
              )
            )
            .limit(1);

          if (existingVersion.length > 0) {
            targetDraftVersionId = existingVersion[0].id;
          } else {
            await tx
              .insert(schema.draftVersions)
              .values({
                id: targetDraftVersionId,
                organizationId: ctx.organizationId,
                draftId: targetDraftId,
                version: 1,
                content: "",
                contentHash: review.draftHash,
                createdBy: ctx.userId ?? "system",
              })
              .onConflictDoNothing();
          }

          await tx
            .insert(schema.reviews)
            .values({
              id: targetReviewId,
              organizationId: ctx.organizationId,
              draftId: targetDraftId,
              draftVersionId: targetDraftVersionId,
              draftHash: review.draftHash,
              sourceSnapshotHash: review.sourceSnapshotHash,
              status: review.findings.some((f: Finding) => f.blocking_for_review) ? "FLAGGED" : "CLEAN",
              modelProvider: review.engineMode ?? null,
              modelVersion: review.engineMode ?? null,
            })
            .onConflictDoNothing();

          if (review.findings?.length) {
            await tx.insert(schema.findings).values(
              review.findings.map((f: Finding) => ({
                id: toValidUuid(f.finding_id || crypto.randomUUID()),
                organizationId: ctx.organizationId,
                reviewId: targetReviewId,
                claimText: f.claim_text,
                startOffset: f.start,
                endOffset: f.end,
                category: f.category,
                evidenceStatus: f.evidence_status,
                severity: f.severity,
                blockingForReview: f.blocking_for_review,
                explanation: f.explanation,
                evidence: f.source_evidence,
                suggestion: f.suggestion ?? null,
              })),
            ).onConflictDoNothing();
          }
        }),
      () => this.inMemoryFallback.saveReview(ctx, review),
    );
  }

  async getReviewByDraftVersion(ctx: TenantContext, draftVersionIdOrDraftId: string, version?: number): Promise<Review | null> {
    return this.executeWithFallback<Review | null>(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const targetId = toValidUuid(draftVersionIdOrDraftId);
          const reviewRows = await tx
            .select()
            .from(schema.reviews)
            .where(and(
              eq(schema.reviews.organizationId, ctx.organizationId),
              or(
                eq(schema.reviews.draftVersionId, targetId),
                eq(schema.reviews.draftId, targetId),
                eq(schema.reviews.draftHash, draftVersionIdOrDraftId),
              ),
            ))
            .limit(1);

      if (!reviewRows.length) return null;
      const r = reviewRows[0];

      const findingRows = await tx
        .select()
        .from(schema.findings)
        .where(and(
          eq(schema.findings.organizationId, ctx.organizationId),
          eq(schema.findings.reviewId, r.id),
        ));

      // Retrieve decision history and latest active decision for this review
      const decisionRows = await tx
        .select()
        .from(schema.decisions)
        .where(and(
          eq(schema.decisions.organizationId, ctx.organizationId),
          eq(schema.decisions.reviewId, r.id),
        ))
        .orderBy(desc(schema.decisions.createdAt));

      const latestDecision = decisionRows[0];
      const decisionObj = (latestDecision && latestDecision.decision !== "REOPENED") ? {
        state: latestDecision.decision as "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
        by: latestDecision.decidedBy,
        at: latestDecision.createdAt.toISOString(),
        draftHash: latestDecision.draftHash,
        sourceSnapshotHash: latestDecision.sourceSnapshotHash,
        reason: latestDecision.reason ?? undefined,
      } : undefined;

      const decisionHistory = decisionRows.map((d: typeof schema.decisions.$inferSelect) => ({
        action: d.decision === "REOPENED" ? ("DECISION_REOPENED" as const) : ("DECISION_RECORDED" as const),
        state: d.decision === "REOPENED" ? undefined : (d.decision as "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"),
        by: d.decidedBy,
        at: d.createdAt.toISOString(),
        draftHash: d.draftHash,
        sourceSnapshotHash: d.sourceSnapshotHash,
        reason: d.reason ?? undefined,
      }));

      return {
        id: r.id,
        draftId: r.draftId,
        draftVersionId: r.draftVersionId,
        draftHash: r.draftHash,
        sourceSnapshotHash: r.sourceSnapshotHash,
        createdAt: r.createdAt.toISOString(),
        findings: findingRows.map((f: typeof schema.findings.$inferSelect) => ({
          finding_id: f.id,
          review_id: r.id,
          draft_id: r.draftId,
          draft_version_id: r.draftVersionId,
          draft_hash: r.draftHash,
          claim_id: f.id,
          claim_text: f.claimText,
          start: f.startOffset,
          end: f.endOffset,
          category: f.category,
          evidence_status: f.evidenceStatus as any,
          severity: f.severity as any,
          blocking_for_review: f.blockingForReview,
          explanation: f.explanation,
          source_evidence: (f.evidence as any) ?? [],
          suggestion: f.suggestion ?? undefined,
          created_at: f.createdAt.toISOString(),
        })),
        comments: [],
        decision: decisionObj,
        decisionHistory,
      };
    }),
      () => this.inMemoryFallback.getReviewByDraftVersion(ctx, draftVersionIdOrDraftId, version),
    );
  }

  async getReviewById(ctx: TenantContext, reviewId: string): Promise<Review | null> {
    return this.executeWithFallback<Review | null>(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const isReviewUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId);
          const reviewRows = await tx
            .select()
            .from(schema.reviews)
            .where(
              and(
                eq(schema.reviews.organizationId, ctx.organizationId),
                isReviewUuid
                  ? eq(schema.reviews.id, reviewId)
                  : eq(schema.reviews.draftHash, reviewId),
              ),
            )
            .limit(1);

          if (!reviewRows.length) return null;
          const r = reviewRows[0];

          const findingRows = await tx
            .select()
            .from(schema.findings)
            .where(and(
              eq(schema.findings.organizationId, ctx.organizationId),
              eq(schema.findings.reviewId, r.id),
            ));

          const decisionRows = await tx
            .select()
            .from(schema.decisions)
            .where(and(
              eq(schema.decisions.organizationId, ctx.organizationId),
              eq(schema.decisions.reviewId, r.id),
            ))
            .orderBy(desc(schema.decisions.createdAt));

          const latestDecision = decisionRows[0];
          const decisionObj = (latestDecision && latestDecision.decision !== "REOPENED") ? {
            state: latestDecision.decision as "APPROVED" | "CHANGES_REQUESTED" | "REJECTED",
            by: latestDecision.decidedBy,
            at: latestDecision.createdAt.toISOString(),
            draftHash: latestDecision.draftHash,
            sourceSnapshotHash: latestDecision.sourceSnapshotHash,
            reason: latestDecision.reason ?? undefined,
          } : undefined;

          const decisionHistory = decisionRows.map((d: typeof schema.decisions.$inferSelect) => ({
            action: d.decision === "REOPENED" ? ("DECISION_REOPENED" as const) : ("DECISION_RECORDED" as const),
            state: d.decision === "REOPENED" ? undefined : (d.decision as "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"),
            by: d.decidedBy,
            at: d.createdAt.toISOString(),
            draftHash: d.draftHash,
            sourceSnapshotHash: d.sourceSnapshotHash,
            reason: d.reason ?? undefined,
          }));

          return {
            id: r.id,
            draftId: r.draftId,
            draftVersionId: r.draftVersionId,
            draftHash: r.draftHash,
            sourceSnapshotHash: r.sourceSnapshotHash,
            createdAt: r.createdAt.toISOString(),
            findings: findingRows.map((f: typeof schema.findings.$inferSelect) => ({
              finding_id: f.id,
              review_id: r.id,
              draft_id: r.draftId,
              draft_version_id: r.draftVersionId,
              draft_hash: r.draftHash,
              claim_id: f.id,
              claim_text: f.claimText,
              start: f.startOffset,
              end: f.endOffset,
              category: f.category,
              evidence_status: f.evidenceStatus as any,
              severity: f.severity as any,
              blocking_for_review: f.blockingForReview,
              explanation: f.explanation,
              source_evidence: (f.evidence as any) ?? [],
              suggestion: f.suggestion ?? undefined,
              created_at: f.createdAt.toISOString(),
            })),
            comments: [],
            decision: decisionObj,
            decisionHistory,
          };
        }),
      () => this.inMemoryFallback.getReviewById(ctx, reviewId),
    );
  }

  async recordDecision(ctx: TenantContext, reviewId: string, decision: ReviewDecision): Promise<void> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
      const decidedBy = decision.by ?? ctx.actor?.displayName ?? ctx.userId ?? "reviewer";
      const decisionVal = decision.state ?? "APPROVED";

      const isReviewUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reviewId);
      let targetReviewId = reviewId;

      if (!isReviewUuid) {
        const revRows = await tx
          .select({ id: schema.reviews.id })
          .from(schema.reviews)
          .where(
            and(
              eq(schema.reviews.organizationId, ctx.organizationId),
              eq(schema.reviews.draftHash, decision.draftHash)
            )
          )
          .orderBy(desc(schema.reviews.createdAt))
          .limit(1);

        if (revRows.length > 0) {
          targetReviewId = revRows[0].id;
        } else {
          throw new Error(`Review with draftHash '${decision.draftHash}' not found for organization ${ctx.organizationId}`);
        }
      } else {
        const revRows = await tx
          .select({ id: schema.reviews.id })
          .from(schema.reviews)
          .where(
            and(
              eq(schema.reviews.organizationId, ctx.organizationId),
              eq(schema.reviews.id, reviewId)
            )
          )
          .limit(1);

        if (revRows.length === 0) {
          throw new Error(`Review '${reviewId}' not found for organization ${ctx.organizationId}`);
        }
      }

      await tx.insert(schema.decisions).values({
        organizationId: ctx.organizationId,
        reviewId: targetReviewId,
        draftHash: decision.draftHash,
        sourceSnapshotHash: decision.sourceSnapshotHash ?? "",
        decision: decisionVal,
        decidedBy,
        reason: decision.reason ?? null,
      });

      await tx.insert(schema.auditEvents).values({
        organizationId: ctx.organizationId,
        actorId: ctx.actor?.userId ?? ctx.userId ?? decidedBy,
        action: `DECISION_${decisionVal}`,
        entityType: "review",
        entityId: targetReviewId,
        metadata: {
          draftHash: decision.draftHash,
          sourceSnapshotHash: decision.sourceSnapshotHash,
          reason: decision.reason,
        },
      });
    }),
      () => this.inMemoryFallback.recordDecision(ctx, reviewId, decision),
    );
  }

  async recordAuditEvent(ctx: TenantContext, event: AuditEvent): Promise<void> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
      const actorId = event.actorId ?? ctx.actor?.userId ?? ctx.userId ?? "system";
      await tx.insert(schema.auditEvents).values({
        organizationId: ctx.organizationId,
        actorId,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        metadata: event.metadata ?? {},
      });
    }),
      () => this.inMemoryFallback.recordAuditEvent(ctx, event),
    );
  }

  async getAuditLog(ctx: TenantContext, limit = 100): Promise<AuditEvent[]> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const rows = await tx
            .select()
            .from(schema.auditEvents)
            .where(eq(schema.auditEvents.organizationId, ctx.organizationId))
            .orderBy(desc(schema.auditEvents.createdAt))
            .limit(limit);

          return rows.map((r: typeof schema.auditEvents.$inferSelect) => ({
            id: r.id,
            organizationId: r.organizationId,
            actorId: r.actorId,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            metadata: r.metadata ?? {},
            createdAt: r.createdAt.toISOString(),
          }));
        }),
      () => this.inMemoryFallback.getAuditLog(ctx, limit),
    );
  }

  async registerAsset(
    ctx: TenantContext,
    asset: AssetRecord | Omit<AssetRecord, "id" | "createdAt">,
  ): Promise<AssetRecord> {
    const id = "id" in asset && asset.id ? asset.id : crypto.randomUUID();
    const createdAt = "createdAt" in asset && asset.createdAt ? asset.createdAt : new Date().toISOString();
    const fullAsset: AssetRecord = {
      ...asset,
      id,
      organizationId: ctx.organizationId,
      createdAt,
    };

    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          await tx
            .insert(schema.assets)
            .values({
              id: fullAsset.id.length === 36 ? fullAsset.id : crypto.randomUUID(),
              organizationId: ctx.organizationId,
              name: fullAsset.name,
              sha256: fullAsset.sha256,
              phash: fullAsset.pHash ?? fullAsset.phash ?? "",
              mimeType: fullAsset.mimeType ?? "image/png",
              byteSize: fullAsset.byteSize ?? 0,
              approvalState: (fullAsset.approvalState as string) ?? "APPROVED",
              uploadedBy: ctx.actor?.userId ?? ctx.userId ?? "user",
            })
            .onConflictDoNothing();

          return fullAsset;
        }),
      () => this.inMemoryFallback.registerAsset(ctx, asset),
    );
  }

  async getAssets(ctx: TenantContext): Promise<AssetRecord[]> {
    return this.executeWithFallback(
      ctx,
      () =>
        withOrganizationScope(ctx, async (tx) => {
          const rows = await tx
            .select()
            .from(schema.assets)
            .where(eq(schema.assets.organizationId, ctx.organizationId));

          return rows.map((r: typeof schema.assets.$inferSelect) => ({
            id: r.id,
            organizationId: r.organizationId,
            name: r.name,
            sha256: r.sha256,
            phash: r.phash,
            pHash: r.phash,
            mimeType: r.mimeType,
            createdAt: r.createdAt.toISOString(),
          }));
        }),
      () => this.inMemoryFallback.getAssets(ctx),
    );
  }

  async updateAsset(
    ctx: TenantContext,
    assetId: string,
    updates: Partial<AssetRecord>
  ): Promise<AssetRecord | null> {
    return this.executeWithFallback<AssetRecord | null>(
      ctx,
      async () =>
        withOrganizationScope(ctx, async (tx) => {
          const updateData: Record<string, unknown> = {};
          if (updates.approvalState) updateData.approvalState = updates.approvalState;
          if (updates.name) updateData.name = updates.name;
          if (updates.allowedUsage) updateData.allowedUsage = updates.allowedUsage;

          if (Object.keys(updateData).length === 0) {
            const existing = await tx
              .select()
              .from(schema.assets)
              .where(
                and(
                  eq(schema.assets.id, assetId),
                  eq(schema.assets.organizationId, ctx.organizationId)
                )
              );
            if (existing.length === 0) return null;
            const r = existing[0];
            return {
              id: r.id,
              organizationId: r.organizationId,
              name: r.name,
              sha256: r.sha256,
              phash: r.phash ?? undefined,
              pHash: r.phash ?? undefined,
              mimeType: r.mimeType,
              byteSize: r.byteSize,
              approvalState: r.approvalState as "APPROVED" | "PENDING_REVIEW" | "REVOKED",
              allowedUsage: r.allowedUsage ?? undefined,
              uploadedBy: r.uploadedBy,
              createdAt: r.createdAt.toISOString(),
            };
          }
          const rows = await tx
            .update(schema.assets)
            .set(updateData)
            .where(
              and(
                eq(schema.assets.id, assetId),
                eq(schema.assets.organizationId, ctx.organizationId)
              )
            )
            .returning();
          if (rows.length === 0) return null;
          const r = rows[0];
          const record: AssetRecord = {
            id: r.id,
            organizationId: r.organizationId,
            name: r.name,
            sha256: r.sha256,
            phash: r.phash ?? undefined,
            pHash: r.phash ?? undefined,
            mimeType: r.mimeType,
            byteSize: r.byteSize,
            approvalState: r.approvalState,
            createdAt: r.createdAt.toISOString(),
          };
          return record;
        }),
      () => this.inMemoryFallback.updateAsset!(ctx, assetId, updates)
    );
  }
}

export const repository: OnBrandRepository = new DrizzleOnBrandRepository();

export function getRepository(): OnBrandRepository {
  return repository;
}
