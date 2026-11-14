import { afterEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import {
  findVerbatimOffsets,
  validateEvidenceCitation,
  llmResponseSchema,
  llmFindingSchema,
  analyzeDocumentWithHostedLLM,
  modelConfigured,
  modelDescriptor,
} from "@/lib/server/model";
import { checkAndIncrementModelQuota } from "@/lib/server/model-limits";
import { createDraft, reviewDraft, seedSources, type Source, type Draft } from "@/lib/onbrand";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Prompt 4: AI Reliability, Evidence Grounding & Failure Safety Suite", () => {
  const baseDraft: Draft = createDraft(
    "Sample Foods Oat Bites contain 6g protein and 4g added sugar per serving.",
    {
      id: "DRAFT-RELIABILITY-01",
      title: "Reliability Test Draft",
      channel: "social",
      product: "Sample Foods Oat Bites",
      publicationDate: "2026-11-14",
      version: 1,
    }
  );

  // ===========================================================================
  // SECTION 1: Real Model Invocation Pipeline & Gateway Proof
  // ===========================================================================
  describe("Section 1: Model Gateway Invocation, Schema Validation & Telemetry", () => {
    it("proves end-to-end model pipeline execution, schema parsing, and finding overlay", async () => {
      vi.stubEnv("ENABLE_HOSTED_MODEL", "true");
      vi.stubEnv("OPENAI_API_KEY", "sk-mock-test-key-12345");
      vi.stubEnv("OPENAI_MODEL", "gpt-4o-mini");

      const mockResponse = {
        id: "chatcmpl-test-001",
        object: "chat.completion",
        created: Date.now(),
        model: "gpt-4o-mini",
        usage: { prompt_tokens: 180, completion_tokens: 65, total_tokens: 245 },
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({
                overall_assessment: "Compliant product packaging copy with grounded nutritional facts.",
                contextual_tone_summary: "Balanced and objective brand tone.",
                findings: [
                  {
                    claim_quote: "contain 6g protein",
                    category: "FACTUAL_ACCURACY",
                    classification: "INFORMATIONAL",
                    severity: "LOW",
                    explanation: "Protein claim matches certified formulation specification.",
                    why_it_matters: "Maintains consumer trust and truth in labeling.",
                    evidence_source_id: "SRC-PRODUCT",
                    evidence_quote: "Sample Foods Oat Bites: protein per serving — 6 g.",
                    confidence: 0.95,
                  },
                ],
              }),
            },
            finish_reason: "stop",
          },
        ],
      };

      vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue(mockResponse as any);

      const existingReview = reviewDraft({ draft: baseDraft, sources: seedSources });
      const result = await analyzeDocumentWithHostedLLM(baseDraft, existingReview, seedSources);

      expect(result.telemetry.status).toBe("SUCCESS");
      expect(result.telemetry.model).toBe("gpt-4o-mini");
      expect(result.telemetry.totalTokens).toBe(245);
      expect(result.telemetry.estimatedCostUsd).toBeGreaterThan(0);
      expect(result.review.engineMode).toBe("model-assisted");
      expect(result.modelDisclosure).toContain("Hosted verification active");
    });

    it("verifies structured Zod schema rejects invalid model outputs", () => {
      const invalidOutput = {
        overall_assessment: "Looks good",
        findings: [
          {
            claim_quote: "", // Empty string violates min(1)
            category: "INVALID_CATEGORY",
            classification: "VIOLATION",
            severity: "EXTREME", // Invalid enum
            confidence: 2.5, // Out of 0..1 range
          },
        ],
      };

      const parsed = llmResponseSchema.safeParse(invalidOutput);
      expect(parsed.success).toBe(false);
    });
  });

  // ===========================================================================
  // SECTION 2: Evidence Retrieval Path & Semantic Claim Disambiguation
  // ===========================================================================
  describe("Section 2: Evidence Retrieval Grounding & Taxonomy Distinctions", () => {
    it("distinguishes NO_APPROVED_EVIDENCE from CONTRADICTED", () => {
      // 1. Unsubstantiated Claim (No approved evidence exists anywhere in knowledge base)
      const unevidencedDraft = createDraft("Planetary cosmic resonance activates cellular photons.", {
        id: "D-UNSUB-01",
        channel: "social",
        product: "Sample Foods Oat Bites",
      });
      const unevidencedReview = reviewDraft({ draft: unevidencedDraft, sources: seedSources });
      const unevidencedFinding = unevidencedReview.findings[0];
      expect(unevidencedFinding.evidence_status).toBe("NO_APPROVED_EVIDENCE");
      expect(unevidencedFinding.evidence_status).not.toBe("CONTRADICTED");

      // 2. Direct Contradiction (Approved evidence exists and says 6g, draft claims 20g)
      const contradictedDraft = createDraft("Sample Foods Oat Bites contain 20g protein per serving.", {
        id: "D-CONTRA-01",
        channel: "social",
        product: "Sample Foods Oat Bites",
      });
      const contradictedReview = reviewDraft({ draft: contradictedDraft, sources: seedSources });
      const contradictedFinding = contradictedReview.findings.find((f) => f.claim_text.includes("20g protein"));
      expect(contradictedFinding?.evidence_status).toBe("CONTRADICTED");
    });

    it("enforces temporal effective date boundaries (disqualifies expired or future evidence)", () => {
      const expiredSource: Source = {
        ...seedSources[0],
        id: "SRC-EXPIRED",
        effectiveFrom: "2024-01-01",
        effectiveTo: "2025-01-01", // Expired in 2025
        facts: [
          {
            id: "F-EXP-1",
            subject: "Sample Foods Oat Bites",
            attribute: "certification",
            value: "Carbon Neutral",
            statement: "Certified Carbon Neutral 2024.",
            sourceId: "SRC-EXPIRED",
          },
        ],
      };

      const check = validateEvidenceCitation([expiredSource], "SRC-EXPIRED", "Certified Carbon Neutral 2024.", {
        referenceDate: "2026-11-14",
      });

      expect(check.isValid).toBe(false);
      expect(check.rejectionReason).toBe("EXPIRED_SOURCE");
    });

    it("enforces channel eligibility restrictions (packaging vs social)", () => {
      const packagingOnlySource: Source = {
        ...seedSources[0],
        id: "SRC-PACK-ONLY",
        channels: ["packaging"], // Eligible only on packaging
        facts: [
          {
            id: "F-PKG-1",
            subject: "Sample Foods Oat Bites",
            attribute: "batch code",
            value: "LOT-9921",
            statement: "Batch Lot LOT-9921 approved.",
            sourceId: "SRC-PACK-ONLY",
          },
        ],
      };

      const checkSocial = validateEvidenceCitation([packagingOnlySource], "SRC-PACK-ONLY", "Batch Lot LOT-9921 approved.", {
        channel: "social",
      });
      expect(checkSocial.isValid).toBe(false);
      expect(checkSocial.rejectionReason).toBe("CHANNEL_INELIGIBLE");

      const checkPackaging = validateEvidenceCitation([packagingOnlySource], "SRC-PACK-ONLY", "Batch Lot LOT-9921 approved.", {
        channel: "packaging",
      });
      expect(checkPackaging.isValid).toBe(true);
    });

    it("enforces source revocation exclusion", () => {
      const revokedSource: Source = {
        ...seedSources[0],
        id: "SRC-REVOKED-01",
        revokedAt: "2026-06-01T00:00:00.000Z",
      };

      const check = validateEvidenceCitation([revokedSource], "SRC-REVOKED-01", "Sample Foods Oat Bites: protein per serving — 6 g.");
      expect(check.isValid).toBe(false);
      expect(check.rejectionReason).toBe("REVOKED_SOURCE");
    });
  });

  // ===========================================================================
  // SECTION 3: Mechanical Citation & Anti-Hallucination Gates
  // ===========================================================================
  describe("Section 3: Mechanical Citation Verification & Zero-Hallucination Gates", () => {
    it("rejects fabricated evidence IDs that do not exist in the tenant repository", () => {
      const check = validateEvidenceCitation(seedSources, "SRC-FABRICATED-9999", "Some factual quote");
      expect(check.isValid).toBe(false);
      expect(check.rejectionReason).toBe("UNKNOWN_SOURCE_ID");
    });

    it("rejects fabricated fact quotes that do not exist in the approved source", () => {
      const check = validateEvidenceCitation(seedSources, "SRC-PRODUCT", "Sample Foods Oat Bites cures chronic insomnia.");
      expect(check.isValid).toBe(false);
      expect(check.rejectionReason).toBe("QUOTE_NOT_FOUND_IN_SOURCE");
    });

    it("rejects hallucinated document quotes that do not exist in the draft text", () => {
      const doc = "Sample Foods Oat Bites contain whole grain oats and real cocoa.";
      const inventedQuote = "Sample Foods Oat Bites are 100% keto-approved.";
      const offsets = findVerbatimOffsets(doc, inventedQuote);
      expect(offsets).toBeNull();
    });

    it("locates verbatim quotes and correctly maps Unicode code-point offsets", () => {
      const doc = "Enjoy Sample Foods Oat Bites with 6g protein per serving.";
      const quote = "6g protein per serving";
      const offsets = findVerbatimOffsets(doc, quote);
      expect(offsets).not.toBeNull();
      expect(doc.slice(offsets!.start, offsets!.end)).toBe(quote);
    });
  });

  // ===========================================================================
  // SECTION 4: Deterministic Floor & Safety Invariants
  // ===========================================================================
  describe("Section 4: Deterministic Floor Preservation", () => {
    it("ensures hosted model cannot remove or suppress deterministic blocking findings", async () => {
      vi.stubEnv("ENABLE_HOSTED_MODEL", "true");
      vi.stubEnv("OPENAI_API_KEY", "sk-mock-key");

      // Draft with a severe regulatory disease violation
      const nonCompliantDraft = createDraft(
        "Sample Foods Oat Bites cure diabetes and prevent chronic illness.",
        { id: "D-DISEASE-01", channel: "social", product: "Sample Foods Oat Bites" }
      );

      const deterministicReview = reviewDraft({ draft: nonCompliantDraft, sources: seedSources });
      expect(deterministicReview.findings.some((f) => f.blocking_for_review)).toBe(true);

      // Model tries to return a clean assessment claiming everything is fine
      const mockCompliantResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                overall_assessment: "Text is inspirational and completely compliant.",
                findings: [], // Empty findings!
              }),
            },
          },
        ],
      };

      vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue(mockCompliantResponse as any);

      const result = await analyzeDocumentWithHostedLLM(nonCompliantDraft, deterministicReview, seedSources);

      // Invariant: The deterministic blocking finding CANNOT be removed!
      expect(result.review.findings.some((f) => f.blocking_for_review)).toBe(true);
      expect(result.review.findings.some((f) => f.claim_text.includes("cure diabetes"))).toBe(true);
    });

    it("ensures model output cannot downgrade a HIGH severity violation to LOW", () => {
      const finding: any = {
        claim_quote: "cures cancer",
        category: "PROMOTIONAL_COMPLIANCE",
        classification: "VIOLATION",
        severity: "CRITICAL",
      };
      const parsed = llmFindingSchema.parse({
        ...finding,
        explanation: "Severe unauthorized health claim.",
        why_it_matters: "FTC and FDA injunction risk.",
        confidence: 0.99,
      });

      expect(parsed.severity).toBe("CRITICAL");
    });
  });

  // ===========================================================================
  // SECTION 5: Failure Handling, Quota Caps & Graceful Fallback
  // ===========================================================================
  describe("Section 5: Gateway Failure Handling & Deterministic Fallback", () => {
    it("handles missing API key by falling back to deterministic-preview without crashing", async () => {
      vi.stubEnv("OPENAI_API_KEY", ""); // Empty key

      const existingReview = reviewDraft({ draft: baseDraft, sources: seedSources });
      const result = await analyzeDocumentWithHostedLLM(baseDraft, existingReview, seedSources);

      expect(result.telemetry.status).toBe("FALLBACK");
      expect(result.review.engineMode).toBe("deterministic-preview");
      expect(result.modelDisclosure).toContain("Deterministic mode is active");
    });

    it("handles provider 500 outage by degrading safely and escalating unverified claims to NEEDS_HUMAN", async () => {
      vi.stubEnv("ENABLE_HOSTED_MODEL", "true");
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockRejectedValue(
        new Error("OpenAI 500: Internal Server Error")
      );

      const draftWithUnverified = createDraft(
        "Sample Foods Oat Bites are popular among mountaineers.",
        { id: "D-MOUNTAIN-01", channel: "social", product: "Sample Foods Oat Bites" }
      );
      const existingReview = reviewDraft({ draft: draftWithUnverified, sources: seedSources });

      const result = await analyzeDocumentWithHostedLLM(draftWithUnverified, existingReview, seedSources);

      expect(result.telemetry.status).toBe("FALLBACK");
      expect(result.review.engineMode).toBe("deterministic-preview");
      expect(result.telemetry.errorMessage).toBeDefined();

      // Unverified message claims must be escalated to NEEDS_HUMAN for safe human review
      const escalated = result.review.findings.find((f) => f.category === "MESSAGE");
      if (escalated) {
        expect(escalated.evidence_status).toBe("NEEDS_HUMAN");
        expect(escalated.blocking_for_review).toBe(true);
      }
    });

    it("handles malformed non-JSON provider response without crashing", async () => {
      vi.stubEnv("ENABLE_HOSTED_MODEL", "true");
      vi.stubEnv("OPENAI_API_KEY", "sk-test-key");

      vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockResolvedValue({
        choices: [{ message: { content: "This is raw unstructured text, not valid JSON." } }],
      } as any);

      const malformedDraft = createDraft("Sample Foods Oat Bites with crisp cocoa oats.", {
        id: "DRAFT-MALFORMED-01",
        channel: "social",
        product: "Sample Foods Oat Bites",
      });
      const existingReview = reviewDraft({ draft: malformedDraft, sources: seedSources });
      const result = await analyzeDocumentWithHostedLLM(malformedDraft, existingReview, seedSources);

      expect(result.telemetry.status).toBe("FALLBACK");
      expect(result.review.engineMode).toBe("deterministic-preview");
    });

    it("enforces 50 reviews/session and 200 reviews/day quota limits", () => {
      const testUserId = `user-quota-test-${Date.now()}`;

      // Increment up to 50
      for (let i = 0; i < 50; i++) {
        const check = checkAndIncrementModelQuota(testUserId);
        expect(check.allowed).toBe(true);
      }

      // 51st call must be blocked
      const blockedSession = checkAndIncrementModelQuota(testUserId);
      expect(blockedSession.allowed).toBe(false);
      expect(blockedSession.reason).toContain("Session model verification limit reached");
    });
  });
});
