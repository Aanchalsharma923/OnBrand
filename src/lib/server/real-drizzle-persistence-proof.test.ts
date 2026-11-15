/**
 * OnBrand — Live Real Drizzle PostgreSQL Persistence Proof
 *
 * Exercises all 7 repository workflows directly against real PostgreSQL via Drizzle ORM:
 * 1. Source & Fact persistence
 * 2. Draft & Versioning persistence
 * 3. Review persistence
 * 4. Approval Decision persistence
 * 5. Audit Event persistence
 * 6. Asset Metadata persistence
 * 7. Process restart / in-memory cache clear survival
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getRepository, DrizzleOnBrandRepository } from "@/lib/server/repository";
import { getDatabase } from "@/lib/server/db";
import * as schema from "@/lib/schema";
import { eq, and, sql } from "drizzle-orm";
import { createDraft } from "@/lib/onbrand";
import type { TenantContext, Source, Review, ReviewDecision, AuditEvent, AssetRecord } from "@/lib/types";
import fs from "node:fs";

// Ensure environment variables from .env.local are populated
if (fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf8");
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#") && t.includes("=")) {
      const idx = t.indexOf("=");
      const key = t.slice(0, idx).trim();
      let val = t.slice(idx + 1).trim();
      if (key === "DATABASE_URL" && val.startsWith("DATABASE_URL=")) {
        val = val.slice("DATABASE_URL=".length).trim();
      }
      val = val.replace(/^['"]|['"]$/g, "").trim();
      process.env[key] = val;
    }
  }
}

describe("Real Drizzle PostgreSQL Live Persistence Suite", () => {
  const testOrgId = crypto.randomUUID();
  const testUserId = crypto.randomUUID();
  const ctx: TenantContext = {
    organizationId: testOrgId,
    userId: testUserId,
    role: "maintainer",
    actor: { userId: testUserId, displayName: "Live DB Auditor" },
  };

  const otherOrgId = crypto.randomUUID();
  const otherCtx: TenantContext = {
    organizationId: otherOrgId,
    userId: crypto.randomUUID(),
    role: "maintainer",
    actor: { userId: crypto.randomUUID(), displayName: "Other Tenant" },
  };

  const db = getDatabase();
  const repo = getRepository();

  beforeAll(async () => {
    // Seed test organizations directly in PostgreSQL
    await db.insert(schema.organizations).values([
      { id: testOrgId, name: "Live Proof Org Alpha", slug: `live-alpha-${Date.now()}` },
      { id: otherOrgId, name: "Live Proof Org Beta", slug: `live-beta-${Date.now()}` },
    ]);
    await db.insert(schema.memberships).values([
      { organizationId: testOrgId, userId: testUserId, role: "maintainer", displayName: "Alpha Maintainer" },
      { organizationId: otherOrgId, userId: otherCtx.userId!, role: "maintainer", displayName: "Beta Maintainer" },
    ]);
  });

  afterAll(async () => {
    // Clean up all synthetic test data from PostgreSQL in reverse foreign-key dependency order
    try {
      await db.delete(schema.auditEvents).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.decisions).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.findings).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.reviews).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.draftVersions).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.drafts).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.facts).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.sources).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.assets).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.memberships).where(sql`organization_id IN (${testOrgId}, ${otherOrgId})`);
      await db.delete(schema.organizations).where(sql`id IN (${testOrgId}, ${otherOrgId})`);
    } catch (err) {
      console.warn("Cleanup warning:", err);
    }
  });

  it("1. creates and retrieves knowledge-base source and facts directly in PostgreSQL", async () => {
    const sourceDbId = crypto.randomUUID();
    const source: Source = {
      id: sourceDbId,
      title: "Live PostgreSQL Verified Source",
      kind: "PRODUCT_FACT",
      authority: 95,
      version: 1,
      effectiveFrom: "2026-01-01",
      channels: ["web", "packaging"],
      owner: "Compliance QA",
      approvalState: "APPROVED",
      facts: [
        {
          id: crypto.randomUUID(),
          sourceId: sourceDbId,
          subject: "Pure Almond Butter",
          attribute: "ingredients",
          value: "100% dry-roasted almonds, sea salt",
          statement: "Pure Almond Butter ingredients: 100% dry-roasted almonds, sea salt.",
        },
      ],
    };

    const saved = await repo.createSource(ctx, source);
    expect(saved.id).toBe(sourceDbId);

    // Verify row exists directly in PostgreSQL table via raw Drizzle query (bypassing repo)
    const dbSourceRows = await db.select().from(schema.sources).where(eq(schema.sources.id, sourceDbId));
    expect(dbSourceRows).toHaveLength(1);
    expect(dbSourceRows[0].title).toBe("Live PostgreSQL Verified Source");

    const dbFactRows = await db.select().from(schema.facts).where(eq(schema.facts.sourceId, sourceDbId));
    expect(dbFactRows).toHaveLength(1);
    expect(dbFactRows[0].subject).toBe("Pure Almond Butter");

    // Retrieve through repo
    const retrieved = await repo.getSourceById(ctx, sourceDbId);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.facts).toHaveLength(1);

    // Verify cross-tenant isolation: other tenant cannot read this source
    const crossTenant = await repo.getSourceById(otherCtx, sourceDbId);
    expect(crossTenant).toBeNull();
  });

  it("2. creates and retrieves draft versions directly in PostgreSQL", async () => {
    const draftId = crypto.randomUUID();
    const draftV1 = createDraft("Initial live compliant copy v1.", {
      id: draftId,
      title: "Live Product Launch Post",
      channel: "social",
      product: "Pure Almond Butter",
      audience: "General Health",
      version: 1,
    });

    const resV1 = await repo.saveDraftVersion(ctx, draftV1);
    expect(resV1.draftId).toBe(draftId);
    expect(resV1.version).toBe(1);

    // Verify row in PostgreSQL schema.drafts
    const dbDraftRows = await db.select().from(schema.drafts).where(
      and(eq(schema.drafts.id, draftId), eq(schema.drafts.organizationId, testOrgId))
    );
    expect(dbDraftRows).toHaveLength(1);
    expect(dbDraftRows[0].currentVersion).toBe(1);

    // Save version 2
    const draftV2 = createDraft("Updated live copy v2 with revised disclaimer.", {
      id: draftId,
      title: "Live Product Launch Post",
      channel: "social",
      product: "Pure Almond Butter",
      audience: "General Health",
      version: 2,
    });
    await repo.saveDraftVersion(ctx, draftV2);

    const retrievedV2 = await repo.getDraftVersion(ctx, draftId, 2);
    expect(retrievedV2).not.toBeNull();
    expect(retrievedV2?.content).toContain("Updated live copy v2");

    // Cross-tenant read rejection
    const crossTenantDraft = await repo.getDraftVersion(otherCtx, draftId, 1);
    expect(crossTenantDraft).toBeNull();
  });

  it("3. creates and retrieves compliance reviews and decisions directly in PostgreSQL", async () => {
    // A review requires an existing draft in drafts table
    const draftId = crypto.randomUUID();
    const draft = createDraft("Sample copy for review test.", {
      id: draftId,
      title: "Review Target Draft",
      channel: "social",
      product: "Pure Almond Butter",
      audience: "General Health",
      version: 1,
    });
    await repo.saveDraftVersion(ctx, draft);

    const reviewId = crypto.randomUUID();
    const draftHash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const testReview: Review = {
      id: reviewId,
      draftId,
      draftVersionId: crypto.randomUUID(),
      draftHash,
      sourceSnapshotHash: "abc",
      createdAt: new Date().toISOString(),
      findings: [],
      comments: [],
    };

    await repo.saveReview(ctx, testReview);

    // Verify row in PostgreSQL schema.reviews
    const dbReviewRows = await db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId));
    expect(dbReviewRows).toHaveLength(1);
    expect(dbReviewRows[0].draftHash).toBe(draftHash);

    // Record decision in PostgreSQL
    const decision: ReviewDecision = {
      state: "APPROVED",
      by: testUserId,
      at: new Date().toISOString(),
      draftHash,
      reason: "Verified live against USDA nutritional guidelines.",
    };
    await repo.recordDecision(ctx, reviewId, decision);

    // Verify row in PostgreSQL schema.decisions
    const dbDecisionRows = await db.select().from(schema.decisions).where(eq(schema.decisions.reviewId, reviewId));
    expect(dbDecisionRows).toHaveLength(1);
    expect(dbDecisionRows[0].decision).toBe("APPROVED");

    // Retrieve review through repo
    const retrieved = await repo.getReviewById(ctx, reviewId);
    expect(retrieved?.decision?.state).toBe("APPROVED");
    expect(retrieved?.decision?.reason).toContain("USDA nutritional guidelines");
  });

  it("4. records and retrieves audit events directly in PostgreSQL", async () => {
    const auditId = crypto.randomUUID();
    const event: AuditEvent = {
      id: auditId,
      organizationId: testOrgId,
      actorId: testUserId,
      action: "LIVE_POSTGRES_VERIFIED",
      entityType: "ORGANIZATION",
      entityId: testOrgId,
      metadata: { verification: "drizzle-tcp", timestamp: Date.now() },
    };

    await repo.recordAuditEvent(ctx, event);

    // Verify row in PostgreSQL schema.auditEvents
    const dbAuditRows = await db.select().from(schema.auditEvents).where(
      and(
        eq(schema.auditEvents.organizationId, testOrgId),
        eq(schema.auditEvents.action, "LIVE_POSTGRES_VERIFIED")
      )
    );
    expect(dbAuditRows.length).toBeGreaterThanOrEqual(1);
    expect(dbAuditRows[0].action).toBe("LIVE_POSTGRES_VERIFIED");

    // Retrieve via getAuditLog
    const logs = await repo.getAuditLog(ctx, 10);
    expect(logs.some((l) => l.action === "LIVE_POSTGRES_VERIFIED")).toBe(true);
  });

  it("5. registers and retrieves asset metadata records directly in PostgreSQL", async () => {
    const assetId = crypto.randomUUID();
    const asset: AssetRecord = {
      id: assetId,
      organizationId: testOrgId,
      name: "verified-brand-logo.png",
      mimeType: "image/png",
      byteSize: 2048,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      approvalState: "APPROVED",
      allowedUsage: "Packaging and digital headers only",
      createdAt: new Date().toISOString(),
      storageKey: `${testOrgId}/${assetId}/verified-brand-logo.png`,
    };

    const saved = await repo.registerAsset(ctx, asset);
    expect(saved.id).toBe(assetId);

    // Verify row in PostgreSQL schema.assets
    const dbAssetRows = await db.select().from(schema.assets).where(eq(schema.assets.id, assetId));
    expect(dbAssetRows).toHaveLength(1);
    expect(dbAssetRows[0].name).toBe("verified-brand-logo.png");

    // Retrieve via repo.getAssets
    const assets = await repo.getAssets(ctx);
    expect(assets.some((a) => a.id === assetId)).toBe(true);
  });

  it("6. PROVES COLD-START PERSISTENCE: Data survives complete memory wipe and fresh repository instance", async () => {
    // 1. Create a unique persistent draft
    const persistentDraftId = crypto.randomUUID();
    const draft = createDraft("Cold start survival content.", {
      id: persistentDraftId,
      title: "Cold Start Test Document",
      channel: "web",
      product: "Pure Almond Butter",
      audience: "Developers",
      version: 1,
    });
    await repo.saveDraftVersion(ctx, draft);

    // 2. Simulate complete application server restart / memory wipe
    // Instantiate a brand new DrizzleOnBrandRepository (its in-memory fallback is completely empty)
    const freshRepo = new DrizzleOnBrandRepository();

    // 3. Read back using the fresh repository instance
    const retrievedDraft = await freshRepo.getDraftVersion(ctx, persistentDraftId, 1);
    expect(retrievedDraft).not.toBeNull();
    expect(retrievedDraft?.id).toBe(persistentDraftId);
    expect(retrievedDraft?.content).toBe("Cold start survival content.");

    // 4. Verify tenant isolation on the fresh repository instance
    const crossTenant = await freshRepo.getDraftVersion(otherCtx, persistentDraftId, 1);
    expect(crossTenant).toBeNull();
  });
});
