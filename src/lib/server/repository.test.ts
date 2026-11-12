import { describe, expect, it } from "vitest";
import { InMemoryRepository } from "./repository";
import type { TenantContext } from "@/lib/types";
import { createDraft, initialDraft } from "@/lib/onbrand";

describe("OnBrand repository layer and tenant isolation", () => {
  const orgAlphaCtx: TenantContext = {
    organizationId: "00000000-0000-0000-0000-000000000001",
    userId: "user-alpha",
    actor: { userId: "user-alpha", displayName: "Alpha Reviewer" },
    role: "reviewer",
  };

  const orgBetaCtx: TenantContext = {
    organizationId: "00000000-0000-0000-0000-000000000002",
    userId: "user-beta",
    actor: { userId: "user-beta", displayName: "Beta Creator" },
    role: "creator",
  };

  it("strictly isolates knowledge sources between two tenants", async () => {
    const repo = new InMemoryRepository();

    // Org Alpha has seeded sources by default
    const alphaSources = await repo.getSources(orgAlphaCtx);
    expect(alphaSources.length).toBeGreaterThan(0);

    // Org Beta starts clean
    const betaSources = await repo.getSources(orgBetaCtx);
    expect(betaSources.length).toBe(0);

    // Add proprietary source to Beta
    await repo.createSource(orgBetaCtx, {
      id: "SRC-BETA-CONFIDENTIAL",
      title: "Beta Secret Formulation",
      kind: "PRODUCT_FACT",
      authority: 90,
      version: 1,
      effectiveFrom: "2026-01-01",
      channels: ["all"],
      owner: "Beta Maintainer",
      approvalState: "APPROVED",
      facts: [{
        id: "F-BETA-1",
        subject: "Beta Brand",
        attribute: "ingredient",
        value: "Organic Chicory",
        statement: "Beta Brand is made with organic chicory.",
        sourceId: "SRC-BETA-CONFIDENTIAL",
      }],
    });

    // Verify Beta has it
    const updatedBeta = await repo.getSources(orgBetaCtx);
    expect(updatedBeta.some((s) => s.id === "SRC-BETA-CONFIDENTIAL")).toBe(true);

    // Verify Alpha CANNOT see Beta's source (Strict Isolation)
    const checkAlpha = await repo.getSources(orgAlphaCtx);
    expect(checkAlpha.some((s) => s.id === "SRC-BETA-CONFIDENTIAL")).toBe(false);
  });

  it("isolates drafts, versions, and audits between tenants", async () => {
    const repo = new InMemoryRepository();

    const betaDraft = createDraft("Beta social copy", {
      id: "DR-BETA-101",
      title: "Beta campaign",
      product: "Beta Bites",
    });

    const saved = await repo.saveDraftVersion(orgBetaCtx, betaDraft);
    expect(saved.draftId).toBe("DR-BETA-101");
    expect(saved.version).toBe(1);

    // Alpha cannot see Beta's draft
    const alphaDrafts = await repo.getDrafts(orgAlphaCtx);
    expect(alphaDrafts.some((d) => d.id === "DR-BETA-101")).toBe(false);

    // Beta can see its draft
    const betaDrafts = await repo.getDrafts(orgBetaCtx);
    expect(betaDrafts.some((d) => d.id === "DR-BETA-101")).toBe(true);
  });

  it("records governance decisions and updates immutable audit log", async () => {
    const repo = new InMemoryRepository();

    await repo.recordDecision(orgAlphaCtx, "REV-DEMO-001", {
      state: "APPROVED",
      by: "Alpha Reviewer",
      at: new Date().toISOString(),
      reason: "Complies with brand standards.",
      draftHash: initialDraft.hash,
    });

    const auditLog = await repo.getAuditLog(orgAlphaCtx);
    expect(auditLog.length).toBeGreaterThan(0);
    expect(auditLog[0].action).toBe("DECISION_APPROVED");
    expect(auditLog[0].actorId).toBe("user-alpha");

    // Beta cannot see Alpha's audit log
    const betaAudit = await repo.getAuditLog(orgBetaCtx);
    expect(betaAudit.length).toBe(0);
  });
});
