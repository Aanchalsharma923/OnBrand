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
});
