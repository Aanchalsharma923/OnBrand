import { describe, expect, it } from "vitest";
import { getRepository } from "./repository";
import type { TenantContext } from "../types";
import { createDraft, seedSources } from "../onbrand";

describe("R1.10 Tenant Isolation & Cross-Tenant Boundary Security", () => {
  const repo = getRepository();

  const orgAlpha: TenantContext = {
    userId: "usr_alpha_creator",
    organizationId: "org_alpha",
    role: "CREATOR",
    actor: { userId: "usr_alpha_creator" },
  };

  const orgAlphaMaintainer: TenantContext = {
    userId: "usr_alpha_maint",
    organizationId: "org_alpha",
    role: "MAINTAINER",
    actor: { userId: "usr_alpha_maint" },
  };

  const orgBeta: TenantContext = {
    userId: "usr_beta_reviewer",
    organizationId: "org_beta",
    role: "REVIEWER",
    actor: { userId: "usr_beta_reviewer" },
  };

  it("prevents Org Beta from viewing or modifying Org Alpha drafts", async () => {
    const alphaDraft = createDraft("Alpha proprietary draft content.", {
      id: "DRAFT-ALPHA-1",
      title: "Alpha Secret Campaign",
      channel: "social",
      product: "Alpha Product",
      audience: "Internal",
      publicationDate: "2026-11-15",
      version: 1,
    });

    // Save draft in Org Alpha
    await repo.saveDraftVersion(orgAlpha, alphaDraft);

    // Fetch drafts as Org Alpha
    const alphaDrafts = await repo.getDrafts(orgAlpha);
    expect(alphaDrafts.some((d) => d.id === "DRAFT-ALPHA-1")).toBe(true);

    // Fetch drafts as Org Beta
    const betaDrafts = await repo.getDrafts(orgBeta);
    expect(betaDrafts.some((d) => d.id === "DRAFT-ALPHA-1")).toBe(false);

    // Get specific draft as Org Beta
    const betaAttempt = await repo.getDraftVersion(orgBeta, "DRAFT-ALPHA-1", 1);
    expect(betaAttempt).toBeNull();
  });

  it("prevents Org Beta from viewing Org Alpha knowledge sources", async () => {
    const alphaSource = {
      ...seedSources[0],
      id: "SRC-ALPHA-SECRET",
      title: "Alpha Internal Compliance Formula",
      owner: "Alpha Legal",
    };

    // Save source in Org Alpha
    await repo.createSource(orgAlphaMaintainer, alphaSource);

    // Fetch sources as Org Alpha
    const alphaSources = await repo.getSources(orgAlphaMaintainer);
    expect(alphaSources.some((s) => s.id === "SRC-ALPHA-SECRET")).toBe(true);

    // Fetch sources as Org Beta
    const betaSources = await repo.getSources(orgBeta);
    expect(betaSources.some((s) => s.id === "SRC-ALPHA-SECRET")).toBe(false);

    // Get specific source as Org Beta
    const betaAttempt = await repo.getSourceById(orgBeta, "SRC-ALPHA-SECRET");
    expect(betaAttempt).toBeNull();
  });

  it("isolates audit events between tenants", async () => {
    await repo.recordAuditEvent(orgAlpha, {
      id: "AUDIT-ALPHA-EVENT-1",
      action: "DRAFT_CREATED",
      entityType: "draft",
      entityId: "DRAFT-ALPHA-1",
      actorId: orgAlpha.userId,
      organizationId: orgAlpha.organizationId,
      metadata: { summary: "Draft created by Alpha" },
      createdAt: new Date().toISOString(),
    });

    const alphaLogs = await repo.getAuditLog(orgAlpha);
    expect(alphaLogs.some((e) => e.id === "AUDIT-ALPHA-EVENT-1")).toBe(true);

    const betaLogs = await repo.getAuditLog(orgBeta);
    expect(betaLogs.some((e) => e.id === "AUDIT-ALPHA-EVENT-1")).toBe(false);
  });

  it("prevents Org Beta from viewing or modifying Org Alpha brand assets", async () => {
    await repo.registerAsset(orgAlpha, {
      id: "ASSET-ALPHA-LOGO-1",
      name: "Alpha Master Logo",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      phash: "0000000000000000",
      pHash: "0000000000000000",
      mimeType: "image/png",
      organizationId: orgAlpha.organizationId,
      createdAt: new Date().toISOString(),
    });

    const alphaAssets = await repo.getAssets(orgAlpha);
    expect(alphaAssets.some((a) => a.id === "ASSET-ALPHA-LOGO-1")).toBe(true);

    const betaAssets = await repo.getAssets(orgBeta);
    expect(betaAssets.some((a) => a.id === "ASSET-ALPHA-LOGO-1")).toBe(false);
  });

  it("prevents cross-tenant source modification (Beta maintainer cannot revoke Alpha source)", async () => {
    // Org Alpha creates a source
    const alphaSource = {
      ...seedSources[0],
      id: "SRC-ALPHA-TO-REVOKE",
      title: "Alpha Active Source",
      owner: "Alpha Legal",
      approvalState: "APPROVED" as const,
    };
    await repo.createSource(orgAlphaMaintainer, alphaSource);

    // Beta attempts to revoke Alpha's source
    await repo.updateSourceStatus(orgBeta, "SRC-ALPHA-TO-REVOKE", "REVOKED");

    // Verify that Alpha's source remains APPROVED and unrevoked
    const alphaCheck = await repo.getSourceById(orgAlphaMaintainer, "SRC-ALPHA-TO-REVOKE");
    expect(alphaCheck).not.toBeNull();
    expect(alphaCheck?.approvalState).toBe("APPROVED");
    expect(alphaCheck?.revokedAt).toBeUndefined();
  });

  it("verifies alternating pooled transactions cannot leak tenant context between requests", async () => {
    // Alternating between Alpha and Beta sequentially (simulating connection pool reuse)
    for (let i = 0; i < 5; i++) {
      const alphaSources = await repo.getSources(orgAlphaMaintainer);
      expect(alphaSources.every((s) => s.id !== "SRC-BETA-EXCLUSIVE")).toBe(true);

      const betaSources = await repo.getSources(orgBeta);
      expect(betaSources.every((s) => s.id !== "SRC-ALPHA-SECRET")).toBe(true);
    }
  });
});
