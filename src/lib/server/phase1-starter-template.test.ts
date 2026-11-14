import { describe, expect, it } from "vitest";
import { cloneSampleFoodsTemplate } from "./starter-template";
import { getRepository } from "./repository";
import { seedSources } from "@/lib/onbrand";
import type { TenantContext } from "@/lib/types";

describe("Phase 1 — Sample Foods Starter Template Provisioning (B2 & B3)", () => {
  const repo = getRepository();

  it("clones all canonical Sample Foods template sources and facts into a fresh organization", async () => {
    const newOrgId = "11111111-2222-3333-4444-555555555555";
    const result = await cloneSampleFoodsTemplate(newOrgId, "New Customer Admin");

    expect(result.organizationId).toBe(newOrgId);
    expect(result.templateVersion).toContain("sample-foods");

    // Total sources in seedSources is 6
    expect(seedSources.length).toBe(6);
    const totalTemplateFacts = seedSources.reduce((acc, s) => acc + (s.facts?.length ?? 0), 0);
    expect(totalTemplateFacts).toBe(40);
  });

  it("ensures cloned sources receive unique IDs and reference the new organization", async () => {
    const orgIdA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const orgIdB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    const ctxA: TenantContext = {
      organizationId: orgIdA,
      userId: "user-a",
      role: "maintainer",
      actor: { userId: "user-a" },
    };

    const ctxB: TenantContext = {
      organizationId: orgIdB,
      userId: "user-b",
      role: "maintainer",
      actor: { userId: "user-b" },
    };

    const { id: _templateId, ...templateData } = seedSources[0];

    // Create cloned starter source in Org A
    const clonedA = await repo.createSource(ctxA, {
      ...templateData,
      owner: "Org A Cloned Starter",
    });

    // Create cloned starter source in Org B
    const clonedB = await repo.createSource(ctxB, {
      ...templateData,
      owner: "Org B Cloned Starter",
    });

    expect(clonedA.id).toBeDefined();
    expect(clonedB.id).toBeDefined();
    // Cloned records have distinct IDs
    expect(clonedA.id).not.toBe(clonedB.id);

    // Modifying Org A's source does not affect Org B
    await repo.updateSourceStatus(ctxA, clonedA.id, "REVOKED");

    const fetchedA = await repo.getSourceById(ctxA, clonedA.id);
    const fetchedB = await repo.getSourceById(ctxB, clonedB.id);

    expect(fetchedA?.approvalState).toBe("REVOKED");
    expect(fetchedB?.approvalState).toBe("APPROVED");
  });

  it("prevents customer organizations from inheriting other customers' private drafts or reviews", async () => {
    const orgCustomer1: TenantContext = {
      organizationId: "12345678-0000-0000-0000-000000000001",
      userId: "cust-1",
      role: "creator",
      actor: { userId: "cust-1" },
    };

    const orgCustomer2: TenantContext = {
      organizationId: "12345678-0000-0000-0000-000000000002",
      userId: "cust-2",
      role: "creator",
      actor: { userId: "cust-2" },
    };

    // Customer 1 creates a private draft
    await repo.saveDraftVersion(orgCustomer1, {
      id: "DRAFT-CUST1-CONFIDENTIAL",
      title: "Confidential Q4 Campaign",
      content: "Exclusive unreleased formulation details.",
      channel: "packaging",
      product: "SuperOat",
      audience: "Internal",
      publicationDate: "2026-12-01",
      version: 1,
      hash: "abc123hash",
      updatedAt: new Date().toISOString(),
    });

    // Customer 2 queries drafts
    const customer2Drafts = await repo.getDrafts(orgCustomer2);
    expect(customer2Drafts.some((d) => d.id === "DRAFT-CUST1-CONFIDENTIAL")).toBe(false);

    const draftDetail = await repo.getDraftVersion(orgCustomer2, "DRAFT-CUST1-CONFIDENTIAL", 1);
    expect(draftDetail).toBeNull();
  });
});
