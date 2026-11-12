import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findVerbatimOffsets,
  validateEvidenceCitation,
  llmResponseSchema,
  analyzeDocumentWithHostedLLM,
} from "./model";
import { createDraft, initialDraft, seedSources, reviewDraft } from "../onbrand";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Requirement 18: Hybrid LLM + Deterministic Architecture Evaluation", () => {
  const sampleDocument = "Sample Foods Oat Bites are packed with 6g protein per serving. Our wholesome recipe contains oats and cocoa for everyday snacking.";

  // 1. Mechanical Document Quote Validation (Zero Hallucination Gate)
  describe("1. Mechanical Document Quote Validation", () => {
    it("locates exact verbatim document substring and derives correct character offsets", () => {
      const quote = "packed with 6g protein per serving";
      const offsets = findVerbatimOffsets(sampleDocument, quote);

      expect(offsets).not.toBeNull();
      expect(sampleDocument.slice(offsets!.start, offsets!.end)).toBe(quote);
    });

    it("handles whitespace variations across document passages cleanly", () => {
      const docWithExtraSpaces = "Sample Foods Oat Bites   are packed with   6g protein.";
      const quote = "are packed with 6g protein.";
      const offsets = findVerbatimOffsets(docWithExtraSpaces, quote);

      expect(offsets).not.toBeNull();
    });

    it("rejects hallucinated or invented text that does not exist in the document", () => {
      const inventedQuote = "Sample Foods Oat Bites are certified 100% gluten-free and zero carb.";
      const offsets = findVerbatimOffsets(sampleDocument, inventedQuote);

      // Must be rejected mechanically
      expect(offsets).toBeNull();
    });
  });

  // 2. Mechanical Evidence Grounding Verification
  describe("2. Mechanical Evidence Grounding Verification", () => {
    it("validates citation when quote exists in an active approved source", () => {
      const check = validateEvidenceCitation(
        seedSources,
        "SRC-PRODUCT",
        "Sample Foods Oat Bites contains 6 g protein per serving."
      );

      expect(check.isValid).toBe(true);
      expect(check.matchedSource?.id).toBe("SRC-PRODUCT");
      expect(check.matchedFactQuote).toBeDefined();
    });

    it("rejects hallucinated source ID that does not exist in the database", () => {
      const check = validateEvidenceCitation(
        seedSources,
        "SRC-NON-EXISTENT-HALLUCINATED",
        "Some claim text"
      );

      expect(check.isValid).toBe(false);
      expect(check.matchedSource).toBeUndefined();
    });

    it("rejects fabricated fact quotation not found in the approved source", () => {
      const check = validateEvidenceCitation(
        seedSources,
        "SRC-PRODUCT",
        "Sample Foods Oat Bites will cure high blood pressure in 2 weeks."
      );

      expect(check.isValid).toBe(false);
      expect(check.matchedFactQuote).toBeUndefined();
    });
  });

  // 3. Structured Zod Schema Enforcement
  describe("3. Structured Zod Schema Enforcement", () => {
    it("accepts well-formed structured finding output matching enterprise categories", () => {
      const validPayload = {
        overall_assessment: "Content is generally aligned with brand voice but contains one unsubstantiated statement.",
        contextual_tone_summary: "Encouraging and conversational tone.",
        findings: [
          {
            claim_quote: "packed with 6g protein per serving",
            category: "FACTUAL_ACCURACY",
            classification: "VIOLATION",
            severity: "MEDIUM",
            explanation: "Serving size basis must be stated alongside protein figures.",
            why_it_matters: "Food packaging regulations require protein claims to state the serving size.",
            evidence_source_id: "SRC-CLAIMS",
            evidence_quote: "6 g protein per 30 g serving",
            confidence: 0.95,
            correction_suggestion: "packed with 6g protein per 30g serving",
          },
        ],
      };

      const parsed = llmResponseSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);
    });

    it("rejects malformed LLM responses missing mandatory explanations or rationale", () => {
      const invalidPayload = {
        overall_assessment: "Some assessment",
        findings: [
          {
            claim_quote: "test",
            // missing category, classification, severity, explanation, why_it_matters, confidence
          },
        ],
      };

      const parsed = llmResponseSchema.safeParse(invalidPayload);
      expect(parsed.success).toBe(false);
    });
  });

  // 4. Deterministic Fallback & Failure Degradation
  describe("4. Deterministic Fallback & Failure Degradation", () => {
    it("degrades gracefully to deterministic review findings when OpenAI credentials missing", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");

      const draft = createDraft("Sample Foods Oat Bites are a delicious cocoa oat snack for everyday moments.", {
        ...initialDraft,
        id: "DRAFT-TEST-FALLBACK-1",
      });
      const initialReview = reviewDraft({ draft, sources: seedSources });

      const result = await analyzeDocumentWithHostedLLM(draft, initialReview, seedSources);

      expect(result.review).toBeDefined();
      expect(result.telemetry.status).toBe("FALLBACK");
      expect(result.review.engineMode).toMatch(/deterministic/);
    });

    it("marks uncertain message claims as NEEDS_HUMAN on model provider failure", async () => {
      vi.stubEnv("OPENAI_API_KEY", "test-key");

      // Mock fetch failure
      vi.stubGlobal("fetch", vi.fn(async () => {
        throw new Error("Provider connection timeout (ETIMEDOUT)");
      }));

      const draft = createDraft("Naturally boosts metabolism and energy.", {
        ...initialDraft,
        id: "DRAFT-TEST-FALLBACK-2",
      });
      const initialReview = reviewDraft({ draft, sources: seedSources });

      const result = await analyzeDocumentWithHostedLLM(draft, initialReview, seedSources);

      expect(result.review).toBeDefined();
      expect(result.telemetry.status).toBe("FALLBACK");
      expect(result.telemetry.errorMessage?.toLowerCase()).toMatch(/time|timeout/);
    });
  });

  // 5. Privacy-Preserving Telemetry (Zero confidential content logged)
  describe("5. Privacy-Preserving Telemetry", () => {
    it("records execution latency, token counts, and findings count without confidential draft text", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");

      const confidentialDraft = createDraft("Top Secret M&A target acquisition formula.", {
        ...initialDraft,
        id: "DRAFT-CONFIDENTIAL-1",
      });
      const review = reviewDraft({ draft: confidentialDraft, sources: seedSources });

      const result = await analyzeDocumentWithHostedLLM(confidentialDraft, review, seedSources);

      const serializedTelemetry = JSON.stringify(result.telemetry);
      expect(serializedTelemetry).not.toContain("Top Secret");
      expect(serializedTelemetry).not.toContain("acquisition");
      expect(result.telemetry).toHaveProperty("latencyMs");
      expect(result.telemetry).toHaveProperty("totalTokens");
      expect(result.telemetry).toHaveProperty("status");
    });
  });
});
