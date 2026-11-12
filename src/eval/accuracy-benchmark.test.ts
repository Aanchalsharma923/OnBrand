/**
 * OnBrand — Frozen Accuracy & False-Positive Reduction Benchmark
 *
 * Requirements:
 * - At least 50 manually labelled passages spanning:
 *   Brand names, Product names, Taglines, Calls to action, Ingredients,
 *   Nutrition claims, Health claims, Comparative claims, Endorsements,
 *   Promotional offers, Disclaimers, Contradictions, Missing evidence.
 * - Measured Metrics:
 *   * Precision >= 95%
 *   * Recall >= 90%
 *   * False-Positive Rate (FPR) <= 5%
 *   * False-Negative Rate (FNR) <= 10%
 *   * Unsupported-to-Contradicted Error Rate = 0%
 *   * Citation validity = 100%
 *   * Exact highlight accuracy = 100%
 * - Full Oat Bites regression fixture validation
 */

import { describe, expect, it } from "vitest";
import { reviewDraft, createDraft, seedSources, type Finding } from "../lib/onbrand";
import { classifyClaim, shouldSkipNonClaim, type ClaimType, type FindingOutcome } from "../lib/claim-classifier";
import { evaluateClaimWithEvidence } from "../lib/evidence-matcher";

interface LabelledPassage {
  id: string;
  text: string;
  expectedClaimType: ClaimType;
  expectedOutcome: FindingOutcome;
  isActionableViolation: boolean; // True if it should be flagged as an issue (contradiction, unsupported requirement, needs human)
  requiresSubstantiation: boolean;
  expectedHighlightSubstring?: string;
  notes?: string;
}

export const FROZEN_BENCHMARK_DATASET: LabelledPassage[] = [
  // 1. BRAND NAMES (Negative controls - MUST NOT BE FLAGGED)
  { id: "P-01", text: "SAMPLE FOODS", expectedClaimType: "BRAND_OR_PRODUCT_NAME", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-02", text: "Sample Foods", expectedClaimType: "BRAND_OR_PRODUCT_NAME", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-03", text: "NovaBio", expectedClaimType: "BRAND_OR_PRODUCT_NAME", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-04", text: "Acme Foods", expectedClaimType: "BRAND_OR_PRODUCT_NAME", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },

  // 2. PRODUCT NAMES (Negative controls - MUST NOT BE FLAGGED)
  { id: "P-05", text: "OAT BITES", expectedClaimType: "BRAND_OR_PRODUCT_NAME", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-06", text: "Sample Foods Oat Bites", expectedClaimType: "BRAND_OR_PRODUCT_NAME", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-07", text: "Meet Sample Foods Oat Bites", expectedClaimType: "PRODUCT_DESCRIPTION", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },

  // 3. SUBJECTIVE TAGLINES (Negative controls - MUST NOT BE FLAGGED unless prohibited terms)
  { id: "P-08", text: "A little bite. A better snack break.", expectedClaimType: "SUBJECTIVE_TAGLINE", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-09", text: "A little bite.", expectedClaimType: "SUBJECTIVE_TAGLINE", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-10", text: "A better snack break.", expectedClaimType: "SUBJECTIVE_TAGLINE", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-11", text: "Snack happy.", expectedClaimType: "SUBJECTIVE_TAGLINE", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-12", text: "Goodness in every bite.", expectedClaimType: "SUBJECTIVE_TAGLINE", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-13", text: "Your everyday treat.", expectedClaimType: "SUBJECTIVE_TAGLINE", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  // Positive control: Tagline with prohibited superlative
  { id: "P-14", text: "A miracle bite for your health.", expectedClaimType: "SUBJECTIVE_TAGLINE", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: false, notes: "Contains prohibited word: miracle" },

  // 4. CALLS TO ACTION (Negative controls - MUST NOT BE FLAGGED)
  { id: "P-15", text: "Try Sample Foods Oat Bites today.", expectedClaimType: "CALL_TO_ACTION", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-16", text: "Order online now.", expectedClaimType: "CALL_TO_ACTION", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-17", text: "Shop at your local store today.", expectedClaimType: "CALL_TO_ACTION", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-18", text: "Grab a jar for your desk.", expectedClaimType: "CALL_TO_ACTION", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-19", text: "Discover more flavors at samplefoods.com.", expectedClaimType: "CALL_TO_ACTION", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },

  // 5. INGREDIENT CLAIMS
  // Approved in seedSources -> SUPPORTED (not a violation)
  { id: "P-20", text: "Made with wholegrain oats.", expectedClaimType: "INGREDIENT_CLAIM", expectedOutcome: "SUPPORTED", isActionableViolation: false, requiresSubstantiation: true },
  { id: "P-21", text: "Contains real cocoa.", expectedClaimType: "INGREDIENT_CLAIM", expectedOutcome: "SUPPORTED", isActionableViolation: false, requiresSubstantiation: true },
  // Unapproved ingredient claims -> UNSUPPORTED (must be flagged as unverified, NOT false)
  { id: "P-22", text: "Formulated with organic Himalayan goji berries.", expectedClaimType: "INGREDIENT_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-23", text: "Crafted with 100% fair-trade cane sugar.", expectedClaimType: "INGREDIENT_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },

  // 6. NUMERIC NUTRITION CLAIMS
  // Approved in seedSources -> SUPPORTED (not a violation)
  { id: "P-24", text: "6 g protein per serving", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "SUPPORTED", isActionableViolation: false, requiresSubstantiation: true },
  { id: "P-25", text: "4 g added sugar per serving", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "SUPPORTED", isActionableViolation: false, requiresSubstantiation: true },
  { id: "P-26", text: "30 g serving", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "SUPPORTED", isActionableViolation: false, requiresSubstantiation: true },
  // Direct numeric contradictions with approved specification -> CONTRADICTED
  { id: "P-27", text: "12 g protein per serving", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: true, notes: "Spec says 6g protein" },
  { id: "P-28", text: "0 g added sugar per serving", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: true, notes: "Spec says 4g added sugar" },
  { id: "P-29", text: "Each serving contains 9 g protein.", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: true },
  // Missing numeric specification -> UNSUPPORTED
  { id: "P-30", text: "150 mg sodium per serving", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },
  // Sugar Free regulatory contradiction under 21 CFR 101.60(c)
  { id: "P-31", text: "SUGAR FREE", expectedClaimType: "NUMERIC_NUTRITION_CLAIM", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: true, notes: "FDA 21 CFR 101.60(c)" },

  // 7. HEALTH & DEVELOPMENTAL CLAIMS (High-risk -> escalate to regulatory review)
  { id: "P-32", text: "helps children grow smarter", expectedClaimType: "HEALTH_DEVELOPMENTAL_CLAIM", expectedOutcome: "NEEDS_HUMAN", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-33", text: "Boosts cognitive performance in children.", expectedClaimType: "HEALTH_DEVELOPMENTAL_CLAIM", expectedOutcome: "NEEDS_HUMAN", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-34", text: "Improves brain power and student focus.", expectedClaimType: "HEALTH_DEVELOPMENTAL_CLAIM", expectedOutcome: "NEEDS_HUMAN", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-35", text: "Cures childhood diabetes in 30 days.", expectedClaimType: "HEALTH_DEVELOPMENTAL_CLAIM", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: true, notes: "Disease claim" },
  { id: "P-36", text: "Clinically proven to prevent heart disease.", expectedClaimType: "HEALTH_DEVELOPMENTAL_CLAIM", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: true },

  // 8. COMPARATIVE CLAIMS (Requires third-party comparative study)
  { id: "P-37", text: "Twice the protein of leading oat snack bars.", expectedClaimType: "COMPARATIVE_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-38", text: "50% less sugar than conventional breakfast bars.", expectedClaimType: "COMPARATIVE_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-39", text: "Preferred 2x more than leading competitor snacks.", expectedClaimType: "COMPARATIVE_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },

  // 9. ENDORSEMENTS & CERTIFICATIONS (Requires active accreditation)
  { id: "P-40", text: "USDA Organic certified.", expectedClaimType: "ENDORSEMENT_CERTIFICATION_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-41", text: "Recommended by 9 out of 10 pediatricians.", expectedClaimType: "ENDORSEMENT_CERTIFICATION_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-42", text: "Non-GMO Project verified seal.", expectedClaimType: "ENDORSEMENT_CERTIFICATION_CLAIM", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },

  // 10. PROMOTIONAL OFFERS (Commercial verification required; not brand voice inconsistency)
  { id: "P-43", text: "Our starter bundle includes 3 jars with standard delivery.", expectedClaimType: "PROMOTIONAL_OFFER", expectedOutcome: "CONTRADICTED", isActionableViolation: true, requiresSubstantiation: true, notes: "Conflicting briefs: 2 jars vs 3 jars" },
  { id: "P-44", text: "Special bundle includes free shipping worldwide.", expectedClaimType: "PROMOTIONAL_OFFER", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },
  { id: "P-45", text: "Buy 2 get 1 free during our seasonal launch.", expectedClaimType: "PROMOTIONAL_OFFER", expectedOutcome: "UNSUPPORTED", isActionableViolation: true, requiresSubstantiation: true },

  // 11. DISCLAIMERS (Negative controls - MUST NOT BE FLAGGED)
  { id: "P-46", text: "TEST CONTENT — Claims are intentionally included for review.", expectedClaimType: "DISCLAIMER", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-47", text: "Terms and conditions apply.", expectedClaimType: "DISCLAIMER", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-48", text: "*Prices and promotions subject to change without notice.", expectedClaimType: "DISCLAIMER", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },

  // 12. ORDINARY COPY / LIFESTYLE TEXT (Negative controls - MUST NOT BE FLAGGED)
  { id: "P-49", text: "Grab a jar for your desk, your commute or your afternoon break.", expectedClaimType: "CALL_TO_ACTION", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-50", text: "A convenient companion for busy mornings and family travel.", expectedClaimType: "ORDINARY_TEXT", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-51", text: "Share with coworkers or enjoy during your afternoon break.", expectedClaimType: "ORDINARY_TEXT", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
  { id: "P-52", text: "Packaged in resealable jars for effortless snacking.", expectedClaimType: "ORDINARY_TEXT", expectedOutcome: "NO_ISSUE", isActionableViolation: false, requiresSubstantiation: false },
];

describe("Frozen Accuracy & False-Positive Reduction Benchmark (52 Passages)", () => {
  it("evaluates classification, precision, recall, and false-positive rates on frozen dataset", () => {
    let tp = 0; // Correctly identified actionable violation
    let fp = 0; // Non-issue incorrectly flagged as actionable violation
    let tn = 0; // Non-issue correctly recognized as non-actionable
    let fn = 0; // True violation missed
    let unsupportedToContradictedErrors = 0;
    let validCitations = 0;
    let totalCitations = 0;
    let exactHighlights = 0;

    for (const item of FROZEN_BENCHMARK_DATASET) {
      // 1. Claim Classification
      const classification = classifyClaim(item.text);
      expect(classification.claimType).toBe(item.expectedClaimType);

      // 2. Non-claim detection for brand/product names, CTAs, taglines, and disclaimers
      const shouldSkip = shouldSkipNonClaim(item.text);
      if (!item.requiresSubstantiation && item.expectedOutcome === "NO_ISSUE" && item.expectedClaimType !== "ORDINARY_TEXT") {
        expect(shouldSkip).toBe(true);
      }

      // 3. Evidence Matcher outcome
      const evalResult = evaluateClaimWithEvidence(
        {
          claimText: item.text,
          claimType: classification.claimType,
          organizationId: "org_alpha",
          product: "Sample Foods Oat Bites",
          brand: "Sample Foods",
        },
        seedSources
      );

      // Verify unsupported claims are NEVER declared contradicted without affirmative proof
      if (item.expectedOutcome === "UNSUPPORTED") {
        if (evalResult.outcome === "CONTRADICTED") {
          unsupportedToContradictedErrors++;
        }
      }

      // Confusion Matrix for Actionable Violations
      const systemFlaggedAsViolation = evalResult.outcome === "CONTRADICTED" || evalResult.outcome === "UNSUPPORTED" || evalResult.outcome === "NEEDS_HUMAN";

      if (item.isActionableViolation) {
        if (systemFlaggedAsViolation) {
          tp++;
        } else {
          fn++;
        }
      } else {
        if (systemFlaggedAsViolation) {
          fp++;
        } else {
          tn++;
        }
      }

      // 4. Citation and Highlight validity checks
      if (evalResult.matchedEvidence.length || evalResult.conflictingEvidence.length) {
        const allEv = [...evalResult.matchedEvidence, ...evalResult.conflictingEvidence];
        for (const ev of allEv) {
          totalCitations++;
          const src = seedSources.find((s) => s.id === ev.source_id);
          if (src && src.version === ev.source_version && src.approvalState === "APPROVED") {
            validCitations++;
          }
        }
      }

      // Exact highlight accuracy: verify explanation contains exact words
      if (evalResult.explanation.exactWords === item.text) {
        exactHighlights++;
      }
    }

    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    const fpr = fp / (fp + tn);
    const fnr = fn / (fn + tp);
    const citationValidity = totalCitations > 0 ? (validCitations / totalCitations) * 100 : 100;
    const highlightAccuracy = (exactHighlights / FROZEN_BENCHMARK_DATASET.length) * 100;

    console.log("=== FROZEN ACCURACY BENCHMARK RESULTS (52 PASSAGES) ===");
    console.log(`True Positives: ${tp}`);
    console.log(`False Positives: ${fp}`);
    console.log(`True Negatives: ${tn}`);
    console.log(`False Negatives: ${fn}`);
    console.log(`Precision: ${(precision * 100).toFixed(2)}% (Target >= 95%)`);
    console.log(`Recall: ${(recall * 100).toFixed(2)}% (Target >= 90%)`);
    console.log(`False-Positive Rate: ${(fpr * 100).toFixed(2)}% (Target <= 5%)`);
    console.log(`False-Negative Rate: ${(fnr * 100).toFixed(2)}% (Target <= 10%)`);
    console.log(`Unsupported-to-Contradicted Error Rate: ${unsupportedToContradictedErrors} (Target 0)`);
    console.log(`Citation Validity: ${citationValidity.toFixed(2)}% (Target 100%)`);
    console.log(`Highlight Accuracy: ${highlightAccuracy.toFixed(2)}% (Target 100%)`);

    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.90);
    expect(fpr).toBeLessThanOrEqual(0.05);
    expect(fnr).toBeLessThanOrEqual(0.10);
    expect(unsupportedToContradictedErrors).toBe(0);
    expect(citationValidity).toBe(100);
    expect(highlightAccuracy).toBe(100);
  });

  it("regression test: Oat Bites Advertisement (Oat_Bites_Short_Ad_Test)", () => {
    const doc = [
      "SAMPLE FOODS",
      "OAT BITES",
      "A little bite. A better snack break.",
      "Meet Sample Foods Oat Bites — a cocoa oat snack made with wholegrain oats for everyday moments.",
      "6 g protein | 4 g added sugar | 30 g serving",
      "Our starter bundle includes 3 jars with standard delivery.",
      "Grab a jar for your desk, your commute or your afternoon break.",
      "SUGAR FREE — helps children grow smarter!",
      "Try Sample Foods Oat Bites today.",
      "TEST CONTENT — Claims are intentionally included for review.",
    ].join("\n");

    const draft = createDraft(doc);
    const review = reviewDraft({ draft, sources: seedSources });

    // 1. Brand name must NOT be flagged
    expect(review.findings.some((f) => f.claim_text === "SAMPLE FOODS")).toBe(false);
    expect(review.findings.some((f) => f.claim_text === "Sample Foods")).toBe(false);

    // 2. Product name must NOT be flagged
    expect(review.findings.some((f) => f.claim_text === "OAT BITES")).toBe(false);
    expect(review.findings.some((f) => f.claim_text === "Oat Bites")).toBe(false);

    // 3. Ordinary tagline must NOT be flagged
    expect(review.findings.some((f) => f.claim_text.includes("A little bite"))).toBe(false);
    expect(review.findings.some((f) => f.claim_text.includes("A better snack break"))).toBe(false);

    // 4. Ordinary call to action must NOT be flagged
    expect(review.findings.some((f) => f.claim_text.includes("Try Sample Foods Oat Bites today"))).toBe(false);
    expect(review.findings.some((f) => f.claim_text.includes("Grab a jar for your desk"))).toBe(false);

    // 5. Test disclaimer must NOT be flagged
    expect(review.findings.some((f) => f.claim_text.includes("TEST CONTENT"))).toBe(false);

    // 6. Numeric nutrition claims matching approved specification must be SUPPORTED
    const proteinFinding = review.findings.find((f) => f.claim_text === "6 g protein");
    expect(proteinFinding).toBeDefined();
    expect(proteinFinding?.evidence_status).toBe("SUPPORTED");
    expect(proteinFinding?.blocking_for_review).toBe(false);

    const sugarFinding = review.findings.find((f) => f.claim_text === "4 g added sugar");
    expect(sugarFinding).toBeDefined();
    expect(sugarFinding?.evidence_status).toBe("SUPPORTED");

    const servingFinding = review.findings.find((f) => f.claim_text === "30 g serving");
    expect(servingFinding).toBeDefined();
    expect(servingFinding?.evidence_status).toBe("SUPPORTED");

    // 7. Sugar free claim is checked against FDA 21 CFR 101.60(c) and complete nutrition data
    const sugarFreeFinding = review.findings.find((f) => f.claim_text === "SUGAR FREE");
    expect(sugarFreeFinding).toBeDefined();
    expect(sugarFreeFinding?.evidence_status).toBe("CONTRADICTED");
    expect(sugarFreeFinding?.explanation).toContain("FDA 21 CFR 101.60(c)");
    expect(sugarFreeFinding?.explanation).toContain("4 g added sugar per 30 g serving");
    expect(sugarFreeFinding?.blocking_for_review).toBe(true);

    // 8. Child-development claim is escalated appropriately
    const childGrowthFinding = review.findings.find((f) => f.claim_text.includes("children grow smarter"));
    expect(childGrowthFinding).toBeDefined();
    expect(childGrowthFinding?.blocking_for_review).toBe(true);
    expect(childGrowthFinding?.explanation).toContain("child-development");

    // 9. Commercial bundle offer is treated as commercial offer, not brand voice inconsistency
    const bundleFinding = review.findings.find((f) => f.claim_text.includes("starter bundle"));
    expect(bundleFinding).toBeDefined();
    expect(bundleFinding?.explanation).not.toContain("Inconsistent voice");
    expect(bundleFinding?.explanation).not.toContain("unauthorised taglines");
    expect(bundleFinding?.explanation).not.toContain("prohibited terminology");

    // 10. Every cited source exists and supports the explanation
    for (const f of review.findings) {
      for (const ev of f.source_evidence) {
        const source = seedSources.find((s) => s.id === ev.source_id);
        expect(source).toBeDefined();
        expect(source?.approvalState).toBe("APPROVED");
        expect(source?.facts.some((fact) => fact.statement === ev.quote)).toBe(true);
      }
    }
  });

  it("verifies multi-tenant isolation: Org Beta cannot see or verify against Org Alpha sources", () => {
    const alphaSource = {
      ...seedSources[0],
      id: "SRC-ALPHA-SECRET",
      title: "Alpha Proprietary Nutrition Spec",
      organizationId: "org_alpha",
    };

    const betaQuery = {
      claimText: "6 g protein per serving",
      claimType: "NUMERIC_NUTRITION_CLAIM" as ClaimType,
      organizationId: "org_beta", // Org Beta querying
      product: "Sample Foods Oat Bites",
    };

    // Querying with Org Beta context against Alpha source
    const result = evaluateClaimWithEvidence(betaQuery, [alphaSource]);

    // Cross-tenant evidence match MUST be rejected
    expect(result.matchedEvidence.some((e) => e.source_id === "SRC-ALPHA-SECRET")).toBe(false);
    expect(result.citationFailures.some((fail) => fail.includes("different organization"))).toBe(true);
  });
});
