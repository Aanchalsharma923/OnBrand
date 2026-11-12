import { describe, expect, it } from "vitest";
import {
  consolidateFindings,
  classifyFinding,
  normalizeCategory,
  deriveWhyItMatters,
  deriveFindingTitle,
} from "./finding-enhancer";
import type { Finding } from "./onbrand";

describe("finding-enhancer", () => {
  const dummyFinding = (overrides: Partial<Finding> & { severity?: any } = {}): Finding => ({
    finding_id: "F-1",
    review_id: "R-1",
    draft_id: "D-1",
    draft_version_id: "D-1-v1",
    draft_hash: "hash123",
    claim_id: "C-1",
    claim_text: "6 g protein per serving",
    start: 0,
    end: 23,
    category: "PRODUCT_FACT",
    evidence_status: "CONTRADICTED",
    severity: "HIGH",
    blocking_for_review: true,
    explanation: "Draft states 6 g protein, but approved spec says 5 g.",
    source_evidence: [],
    created_at: new Date().toISOString(),
    ...overrides,
  });

  it("classifies contradictory findings as CONFIRMED_VIOLATION", () => {
    const f = dummyFinding({ evidence_status: "CONTRADICTED", severity: "CRITICAL" as any });
    const { classification, severity, confidence } = classifyFinding(f);
    expect(classification).toBe("CONFIRMED_VIOLATION");
    expect(severity).toBe("Critical");
    expect(confidence).toBeGreaterThanOrEqual(90);
  });

  it("classifies missing evidence as UNSUPPORTED_CLAIM without claiming it is false", () => {
    const f = dummyFinding({
      evidence_status: "NO_APPROVED_EVIDENCE",
      explanation: "No approved clinical study found.",
    });
    const { classification, severity } = classifyFinding(f);
    expect(classification).toBe("UNSUPPORTED_CLAIM");
    expect(severity).toBe("High");
  });

  it("classifies partial or ambiguous items as NEEDS_HUMAN", () => {
    const f = dummyFinding({ evidence_status: "NEEDS_HUMAN", severity: "REVIEW" });
    const { classification } = classifyFinding(f);
    expect(classification).toBe("NEEDS_HUMAN");
  });

  it("normalizes categories into the 6 standard governance categories", () => {
    expect(normalizeCategory("PRODUCT_FACT", "6 g protein", "nutrition fact")).toBe("FACTUAL_ACCURACY");
    expect(normalizeCategory("POLICY", "clinically proven", "clinical trial claim")).toBe("PROMOTIONAL_COMPLIANCE");
    expect(normalizeCategory("VISUAL", "color mismatch", "palette deviation")).toBe("VISUAL_IDENTITY");
    expect(normalizeCategory("ACCESSIBILITY", "contrast ratio", "contrast below 4.5:1")).toBe("ACCESSIBILITY");
    expect(normalizeCategory("SOURCE_SECURITY", "system prompt", "quarantined injection")).toBe("SECURITY_CONFIDENTIALITY");
    expect(normalizeCategory("MESSAGE", "warm tone", "brand tone guideline")).toBe("BRAND_CONSISTENCY");
  });

  it("consolidates duplicate occurrences into a single finding with an occurrence list", () => {
    const f1 = dummyFinding({ finding_id: "F-1", claim_text: "Guaranteed results", start: 10, end: 28 });
    const f2 = dummyFinding({ finding_id: "F-2", claim_text: "Guaranteed results", start: 100, end: 118 });
    const fullText = "Try today! Guaranteed results on day one. Remember: Guaranteed results are our hallmark.";

    const consolidated = consolidateFindings([f1, f2], fullText);
    expect(consolidated.length).toBe(1);
    expect(consolidated[0].occurrences.length).toBeGreaterThanOrEqual(2);
    expect(consolidated[0].title).toContain("Guarantee");
    expect(consolidated[0].whyItMatters).toContain("FDA/FTC");
  });

  it("derives clear real-world risk rationale for why it matters", () => {
    const why = deriveWhyItMatters("PROMOTIONAL_COMPLIANCE", "UNSUPPORTED_CLAIM", "clinically tested");
    expect(why).toContain("FDA/FTC");
    expect(why).toContain("mislead consumers");
  });
});
