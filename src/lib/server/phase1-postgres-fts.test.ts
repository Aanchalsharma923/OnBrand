import { describe, expect, it } from "vitest";
import { getRepository } from "./repository";
import type { TenantContext } from "@/lib/types";

describe("Phase 1 — Full-Text Evidence Retrieval & GIN Filtering (Part G)", () => {
  const repo = getRepository();

  const orgContext: TenantContext = {
    organizationId: "fts-org-test-0001",
    userId: "fts-maintainer",
    role: "maintainer",
    actor: { userId: "fts-maintainer" },
  };

  const otherOrgContext: TenantContext = {
    organizationId: "fts-org-test-0002",
    userId: "other-user",
    role: "reviewer",
    actor: { userId: "other-user" },
  };

  it("retrieves relevant approved facts matching search queries", async () => {
    // Register test approved source with facts
    await repo.createSource(orgContext, {
      title: "Protein Bar Formulation Specification",
      kind: "PRODUCT_FACT",
      authority: 95,
      version: 1,
      effectiveFrom: "2025-01-01",
      effectiveTo: "2027-12-31",
      approvalState: "APPROVED",
      channels: ["packaging", "web", "social"],
      owner: "Formulation Science",
      facts: [
        {
          id: "FTS-FACT-1",
          sourceId: "",
          subject: "Oat Bar",
          attribute: "protein per bar",
          value: "15g",
          unit: "g",
          statement: "Each Oat Bar delivers 15 grams of plant-based pea protein.",
        },
        {
          id: "FTS-FACT-2",
          sourceId: "",
          subject: "Oat Bar",
          attribute: "fiber content",
          value: "8g",
          unit: "g",
          statement: "Each Oat Bar contains 8 grams of prebiotic dietary fiber.",
        },
      ],
    });

    // Query for protein
    const results = await repo.searchFacts(orgContext, "protein", "packaging", "2026-06-01");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((f) => f.statement.includes("pea protein"))).toBe(true);

    // Query for irrelevant term
    const noResults = await repo.searchFacts(orgContext, "quantum teleportation", "packaging", "2026-06-01");
    expect(noResults.length).toBe(0);
  });

  it("excludes unapproved, revoked, and temporally expired sources from search results", async () => {
    // 1. Unapproved / pending source
    await repo.createSource(orgContext, {
      title: "Draft Unapproved Claims",
      kind: "APPROVED_CLAIM",
      authority: 50,
      version: 1,
      effectiveFrom: "2025-01-01",
      approvalState: "PENDING_REVIEW",
      channels: ["web"],
      owner: "Copywriter Intern",
      facts: [
        {
          id: "FTS-UNAPPROVED-1",
          sourceId: "",
          subject: "Oat Bar",
          attribute: "health claim",
          value: "cures exhaustion",
          statement: "Oat Bar instantly cures mental and physical exhaustion.",
        },
      ],
    });

    // 2. Expired source (effectiveTo in the past)
    await repo.createSource(orgContext, {
      title: "Expired 2024 Promotional Campaign",
      kind: "GUIDELINE",
      authority: 70,
      version: 1,
      effectiveFrom: "2024-01-01",
      effectiveTo: "2024-12-31",
      approvalState: "APPROVED",
      channels: ["web"],
      owner: "Marketing 2024",
      facts: [
        {
          id: "FTS-EXPIRED-1",
          sourceId: "",
          subject: "Oat Bar",
          attribute: "promo discount",
          value: "50% off",
          statement: "Limited time 50% discount across all retail stores.",
        },
      ],
    });

    // 3. Revoked source
    const revokedSource = await repo.createSource(orgContext, {
      title: "Revoked Ingredient Claim",
      kind: "PRODUCT_FACT",
      authority: 80,
      version: 1,
      effectiveFrom: "2025-01-01",
      approvalState: "APPROVED",
      channels: ["web"],
      owner: "Legal",
      facts: [
        {
          id: "FTS-REVOKED-1",
          sourceId: "",
          subject: "Oat Bar",
          attribute: "sweetener",
          value: "xylitol",
          statement: "Oat Bar is exclusively sweetened with xylitol.",
        },
      ],
    });
    await repo.updateSourceStatus(orgContext, revokedSource.id, "REVOKED");

    // Search with publication date in 2026
    const searchDate = "2026-06-01";

    // Unapproved claim must NOT appear
    const unapprovedSearch = await repo.searchFacts(orgContext, "exhaustion", "web", searchDate);
    expect(unapprovedSearch.some((f) => f.statement.includes("exhaustion"))).toBe(false);

    // Expired source must NOT appear
    const expiredSearch = await repo.searchFacts(orgContext, "50% discount", "web", searchDate);
    expect(expiredSearch.some((f) => f.statement.includes("50% discount"))).toBe(false);

    // Revoked source must NOT appear
    const revokedSearch = await repo.searchFacts(orgContext, "xylitol", "web", searchDate);
    expect(revokedSearch.some((f) => f.statement.includes("sweetened with xylitol"))).toBe(false);
  });

  it("strictly isolates full-text search results to the requesting tenant", async () => {
    // Org 1 has proprietary fact
    const org1Fact = await repo.searchFacts(orgContext, "pea protein", "packaging", "2026-06-01");
    expect(org1Fact.length).toBeGreaterThan(0);

    // Org 2 searching for same term gets 0 results
    const org2Fact = await repo.searchFacts(otherOrgContext, "pea protein", "packaging", "2026-06-01");
    expect(org2Fact.length).toBe(0);
  });

  it("filters search results by delivery channel", async () => {
    // Packaging channel matches
    const packagingResults = await repo.searchFacts(orgContext, "protein", "packaging", "2026-06-01");
    expect(packagingResults.some((f) => f.statement.includes("pea protein"))).toBe(true);

    // Unapproved channel (e.g. "billboard" not in channels list) is filtered out
    const billboardResults = await repo.searchFacts(orgContext, "protein", "billboard", "2026-06-01");
    expect(billboardResults.length).toBe(0);
  });
});
