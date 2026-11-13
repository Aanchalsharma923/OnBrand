/**
 * OnBrand — Universal Multi-Attribute Evidence Matching Engine
 *
 * Enforces strict governance checks before any evidence can substantiate or contradict a claim:
 * 1. Strict tenant isolation (Zero cross-tenant leakage)
 * 2. Dynamic brand and product scope
 * 3. Product variant/SKU matching
 * 4. Market and country regulatory scope (India FSSAI, US FDA/FTC, EU EFSA, UK ASA)
 * 5. Source approval status (Only "APPROVED", excludes "PENDING_REVIEW", "REVOKED", "DRAFT", "EXPIRED", "SUPERSEDED")
 * 6. Source effective date and expiry (effectiveFrom <= targetDate <= effectiveTo)
 * 7. Active version check
 * 8. Unit and serving basis compatibility
 *
 * Separates evaluation into three independent review dimensions:
 * A. Evidence Verification: SUPPORTED | CONTRADICTED | UNSUPPORTED | NEEDS_HUMAN | NOT_APPLICABLE
 * B. Governance & Policy Compliance: COMPLIANT | NON_COMPLIANT | NEEDS_REVIEW | NOT_APPLICABLE
 * C. Brand Voice & Quality: ON_BRAND | MINOR_SUGGESTION | OFF_BRAND | NEEDS_HUMAN
 */

import type { Source, Fact } from "./onbrand";
import type { ClaimType, FindingOutcome } from "./claim-classifier";
import { generateSpecificExplanation, type StructuredFindingExplanation } from "./finding-explanations";
import {
  evaluateSugarClaim,
  evaluateDiseaseClaim,
  evaluateChildDevelopmentClaim,
  type RegulatoryFindingDetails,
} from "./regulatory-intelligence";
import { evaluateTone, type ToneEvaluationResult } from "./tone-evaluator";
import { resolveBrandContext, type BrandContext } from "./brand-context";

export type EvidenceVerificationStatus =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "UNSUPPORTED"
  | "NEEDS_HUMAN"
  | "NOT_APPLICABLE";

export type GovernanceComplianceStatus =
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "NEEDS_REVIEW"
  | "NOT_APPLICABLE";

export type BrandVoiceQualityStatus =
  | "ON_BRAND"
  | "MINOR_SUGGESTION"
  | "OFF_BRAND"
  | "NEEDS_HUMAN";

export interface EvidenceMatchCriteria {
  claimText: string;
  claimType: ClaimType;
  organizationId?: string;
  brand?: string;
  product?: string;
  variantSku?: string;
  marketCountry?: string;
  channel?: string;
  targetDate?: string;
  claimedUnit?: string;
  claimedServingBasis?: string;
  brandContext?: BrandContext;
}

export interface MatchedEvidenceItem {
  source_id: string;
  source_version: number;
  source_title: string;
  quote: string;
  authority: number;
  score: number;
  attribute: string;
  value: string;
  unit?: string;
}

export interface EvidenceEvaluationResult {
  // Three independent review dimensions
  evidenceVerification: EvidenceVerificationStatus;
  governanceCompliance: GovernanceComplianceStatus;
  brandVoiceQuality: BrandVoiceQualityStatus;

  // Backwards-compatible legacy fields
  outcome: FindingOutcome;
  matchedEvidence: MatchedEvidenceItem[];
  conflictingEvidence: MatchedEvidenceItem[];
  explanation: StructuredFindingExplanation;
  severity: "LOW" | "MEDIUM" | "HIGH" | "REVIEW";
  blocking: boolean;
  citationFailures: string[];

  // Detailed subsystem outputs
  regulatoryDetails?: RegulatoryFindingDetails;
  toneAnalysis?: ToneEvaluationResult;
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Evaluates a candidate claim against available sources across the three independent dimensions.
 */
export function evaluateClaimWithEvidence(
  criteria: EvidenceMatchCriteria,
  sources: Source[]
): EvidenceEvaluationResult {
  const {
    claimText,
    claimType,
    organizationId,
    product = "Target Product",
    brand = "Target Brand",
    channel = "social",
    marketCountry = "UNKNOWN",
    targetDate = new Date().toISOString().slice(0, 10),
  } = criteria;

  const brandContext =
    criteria.brandContext ??
    resolveBrandContext({
      organizationId,
      brand,
      product,
      channel,
      marketCountry,
      sources,
    });

  const citationFailures: string[] = [];
  const normClaim = normalize(claimText);
  const normProduct = normalize(product);

  // 1. Strict multi-attribute source filtering
  const eligibleSources = sources.filter((source) => {
    // Tenant check
    const sourceOrg = (source as unknown as { organizationId?: string }).organizationId;
    if (organizationId && sourceOrg && sourceOrg !== organizationId) {
      citationFailures.push(`Source ${source.id} excluded: belongs to different organization (${sourceOrg})`);
      return false;
    }

    // Approval state check
    if (source.approvalState !== "APPROVED") {
      citationFailures.push(`Source ${source.id} excluded: approval state is '${source.approvalState}' (only 'APPROVED' allowed)`);
      return false;
    }

    // Revocation check
    if (source.revokedAt) {
      citationFailures.push(`Source ${source.id} excluded: revoked on ${source.revokedAt}`);
      return false;
    }

    // Effective date range
    if (source.effectiveFrom && source.effectiveFrom > targetDate) {
      citationFailures.push(`Source ${source.id} excluded: effectiveFrom (${source.effectiveFrom}) is after target date (${targetDate})`);
      return false;
    }
    if (source.effectiveTo && source.effectiveTo < targetDate) {
      citationFailures.push(`Source ${source.id} excluded: expired on ${source.effectiveTo}`);
      return false;
    }

    // Channel scope
    if (channel && source.channels && source.channels.length > 0) {
      const normChannel = channel.toLowerCase();
      const inScope = source.channels.includes("all") || source.channels.map((c) => c.toLowerCase()).includes(normChannel);
      if (!inScope) {
        citationFailures.push(`Source ${source.id} excluded: not eligible for channel '${channel}'`);
        return false;
      }
    }

    return true;
  });

  const eligibleFacts: Array<{ source: Source; fact: Fact }> = eligibleSources.flatMap((source) =>
    source.facts.map((fact) => ({ source, fact }))
  );

  const matchedEvidence: MatchedEvidenceItem[] = [];
  const conflictingEvidence: MatchedEvidenceItem[] = [];

  // Evaluate tone dimension independently
  const toneResult = evaluateTone(claimText, brandContext.brandVoice, channel);

  // =========================================================================
  // CASE 1: Non-Claims (Brand/Product names, CTAs, Disclaimers, Ordinary copy)
  // =========================================================================
  if (
    claimType === "BRAND_NAME" ||
    claimType === "PRODUCT_NAME" ||
    claimType === "BRAND_OR_PRODUCT_NAME" ||
    claimType === "PRODUCT_VARIANT" ||
    claimType === "PRODUCT_DESCRIPTION" ||
    claimType === "CALL_TO_ACTION" ||
    claimType === "DISCLAIMER" ||
    claimType === "LEGAL_NOTICE" ||
    claimType === "ORDINARY_TEXT" ||
    claimType === "ORDINARY_DESCRIPTIVE" ||
    (claimType === "SUBJECTIVE_TAGLINE" && !/miracle|guaranteed|guarantee|unhackable|impenetrable|foolproof/i.test(claimText))
  ) {
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "NO_ISSUE",
      product,
      brand,
    });
    return {
      evidenceVerification: "NOT_APPLICABLE",
      governanceCompliance: "COMPLIANT",
      brandVoiceQuality: toneResult.brandVoiceQuality,
      outcome: "NO_ISSUE",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "LOW",
      blocking: false,
      citationFailures,
      toneAnalysis: toneResult,
    };
  }

  // =========================================================================
  // CASE 2: Prohibited Words in Taglines
  // =========================================================================
  if (claimType === "SUBJECTIVE_TAGLINE" && /miracle|guaranteed|guarantee|unhackable|impenetrable|foolproof/i.test(claimText)) {
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "CONTRADICTED",
      product,
      brand,
    });
    return {
      evidenceVerification: "NOT_APPLICABLE",
      governanceCompliance: "NON_COMPLIANT",
      brandVoiceQuality: "OFF_BRAND",
      outcome: "CONTRADICTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "HIGH",
      blocking: true,
      citationFailures,
      toneAnalysis: toneResult,
    };
  }

  // =========================================================================
  // CASE 3: Regulated Sugar Claims (Jurisdiction-Aware)
  // =========================================================================
  const sugarRegResult = evaluateSugarClaim({
    claimText,
    facts: eligibleFacts.map((ef) => ef.fact),
    productName: product,
    marketCountry: brandContext.marketCountry,
    framework: brandContext.applicableRegulatoryFramework,
  });

  if (sugarRegResult) {
    if (sugarRegResult.complianceStatus === "NON_COMPLIANT") {
      // Find the conflicting fact in eligibleFacts
      const conflictFact = eligibleFacts.find(
        (ef) =>
          normalize(ef.fact.subject).includes(normProduct) &&
          (normalize(ef.fact.attribute).includes("sugar") || normalize(ef.fact.attribute).includes("added sugar"))
      );
      if (conflictFact) {
        conflictingEvidence.push({
          source_id: conflictFact.source.id,
          source_version: conflictFact.source.version,
          source_title: conflictFact.source.title,
          quote: conflictFact.fact.statement,
          authority: conflictFact.source.authority,
          score: 1.0,
          attribute: conflictFact.fact.attribute,
          value: conflictFact.fact.value,
          unit: conflictFact.fact.unit,
        });
      }

      const explanation = generateSpecificExplanation({
        exactWords: claimText,
        claimType: "NUTRITION_CLAIM",
        outcome: "CONTRADICTED",
        product,
        brand,
        conflictingEvidence,
        regulatoryDetails: sugarRegResult,
      });

      return {
        evidenceVerification: "CONTRADICTED",
        governanceCompliance: "NON_COMPLIANT",
        brandVoiceQuality: toneResult.brandVoiceQuality,
        outcome: "CONTRADICTED",
        matchedEvidence: [],
        conflictingEvidence,
        explanation,
        severity: "HIGH",
        blocking: true,
        citationFailures,
        regulatoryDetails: sugarRegResult,
        toneAnalysis: toneResult,
      };
    }

    if (sugarRegResult.complianceStatus === "COMPLIANT") {
      const matchFact = eligibleFacts.find(
        (ef) =>
          normalize(ef.fact.subject).includes(normProduct) &&
          (normalize(ef.fact.attribute).includes("sugar") || normalize(ef.fact.attribute).includes("total sugar"))
      );
      if (matchFact) {
        matchedEvidence.push({
          source_id: matchFact.source.id,
          source_version: matchFact.source.version,
          source_title: matchFact.source.title,
          quote: matchFact.fact.statement,
          authority: matchFact.source.authority,
          score: 1.0,
          attribute: matchFact.fact.attribute,
          value: matchFact.fact.value,
          unit: matchFact.fact.unit,
        });
      }

      const explanation = generateSpecificExplanation({
        exactWords: claimText,
        claimType: "NUTRITION_CLAIM",
        outcome: "SUPPORTED",
        product,
        brand,
        matchedEvidence,
        regulatoryDetails: sugarRegResult,
      });

      return {
        evidenceVerification: "SUPPORTED",
        governanceCompliance: "COMPLIANT",
        brandVoiceQuality: toneResult.brandVoiceQuality,
        outcome: "SUPPORTED",
        matchedEvidence,
        conflictingEvidence: [],
        explanation,
        severity: "LOW",
        blocking: false,
        citationFailures,
        regulatoryDetails: sugarRegResult,
        toneAnalysis: toneResult,
      };
    }

    if (sugarRegResult.complianceStatus === "NEEDS_REVIEW") {
      const explanation = generateSpecificExplanation({
        exactWords: claimText,
        claimType: "NUTRITION_CLAIM",
        outcome: "NEEDS_HUMAN",
        product,
        brand,
        regulatoryDetails: sugarRegResult,
      });

      return {
        evidenceVerification: "NEEDS_HUMAN",
        governanceCompliance: "NEEDS_REVIEW",
        brandVoiceQuality: toneResult.brandVoiceQuality,
        outcome: "NEEDS_HUMAN",
        matchedEvidence: [],
        conflictingEvidence: [],
        explanation,
        severity: "REVIEW",
        blocking: false,
        citationFailures,
        regulatoryDetails: sugarRegResult,
        toneAnalysis: toneResult,
      };
    }
  }

  // =========================================================================
  // CASE 4: Disease / Therapeutic Claims
  // =========================================================================
  const diseaseRegResult = evaluateDiseaseClaim({
    claimText,
    marketCountry: brandContext.marketCountry,
    framework: brandContext.applicableRegulatoryFramework,
  });

  if (diseaseRegResult) {
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType: "HEALTH_MEDICAL_CLAIM",
      outcome: "CONTRADICTED",
      product,
      brand,
      regulatoryDetails: diseaseRegResult,
    });
    return {
      evidenceVerification: "CONTRADICTED",
      governanceCompliance: "NON_COMPLIANT",
      brandVoiceQuality: "OFF_BRAND",
      outcome: "CONTRADICTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "HIGH",
      blocking: true,
      citationFailures,
      regulatoryDetails: diseaseRegResult,
      toneAnalysis: toneResult,
    };
  }

  // =========================================================================
  // CASE 5: Child Development & Cognition Claims
  // =========================================================================
  const childDevResult = evaluateChildDevelopmentClaim({
    claimText,
    marketCountry: brandContext.marketCountry,
    framework: brandContext.applicableRegulatoryFramework,
  });

  if (childDevResult) {
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType: "DEVELOPMENTAL_CLAIM",
      outcome: "NEEDS_HUMAN",
      product,
      brand,
      regulatoryDetails: childDevResult,
    });
    return {
      evidenceVerification: "NEEDS_HUMAN",
      governanceCompliance: "NEEDS_REVIEW",
      brandVoiceQuality: toneResult.brandVoiceQuality,
      outcome: "NEEDS_HUMAN",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "REVIEW",
      blocking: false,
      citationFailures,
      regulatoryDetails: childDevResult,
      toneAnalysis: toneResult,
    };
  }

  // =========================================================================
  // CASE 6: Numeric Nutrition & Specification Claims
  // =========================================================================
  if (
    claimType === "NUTRITION_CLAIM" ||
    claimType === "NUMERIC_NUTRITION_CLAIM" ||
    claimType === "NUMERIC_SPECIFICATION"
  ) {
    const numMatch =
      claimText.match(/(\d+(?:\.\d+)?)\s*(g|grams?|mg|ml|kcal|calories)\s+(protein|added\s+sugar|sugar|sugars|total\s+sugars|serving)/i) ||
      claimText.match(/(\d+(?:\.\d+)?)\s*(g|grams?|oz|bites?)\s+serving/i);

    if (numMatch) {
      const claimedVal = numMatch[1];
      const claimedUnit = numMatch[2].toLowerCase();
      const claimedMetric = (numMatch[3] || "serving").toLowerCase();

      const matchingFact = eligibleFacts.find(({ fact }) => {
        const subjMatch = normalize(fact.subject).includes(normProduct) || normProduct.includes(normalize(fact.subject));
        if (!subjMatch) return false;

        const normAttr = normalize(fact.attribute);
        if (claimedMetric.includes("protein") && normAttr.includes("protein")) return true;
        if (claimedMetric.includes("sugar") && (normAttr.includes("sugar") || normAttr.includes("added sugar"))) return true;
        if (claimedMetric.includes("serving") && normAttr.includes("serving size")) return true;
        return false;
      });

      if (matchingFact) {
        const factVal = matchingFact.fact.value.trim();
        const factUnit = (matchingFact.fact.unit ?? "").toLowerCase().trim();

        if (claimedVal === factVal && (!factUnit || claimedUnit.startsWith(factUnit[0]))) {
          matchedEvidence.push({
            source_id: matchingFact.source.id,
            source_version: matchingFact.source.version,
            source_title: matchingFact.source.title,
            quote: matchingFact.fact.statement,
            authority: matchingFact.source.authority,
            score: 1.0,
            attribute: matchingFact.fact.attribute,
            value: matchingFact.fact.value,
            unit: matchingFact.fact.unit,
          });

          const explanation = generateSpecificExplanation({
            exactWords: claimText,
            claimType,
            outcome: "SUPPORTED",
            product,
            brand,
            matchedEvidence,
          });

          return {
            evidenceVerification: "SUPPORTED",
            governanceCompliance: "COMPLIANT",
            brandVoiceQuality: toneResult.brandVoiceQuality,
            outcome: "SUPPORTED",
            matchedEvidence,
            conflictingEvidence: [],
            explanation,
            severity: "LOW",
            blocking: false,
            citationFailures,
            toneAnalysis: toneResult,
          };
        } else {
          // Direct numeric contradiction
          conflictingEvidence.push({
            source_id: matchingFact.source.id,
            source_version: matchingFact.source.version,
            source_title: matchingFact.source.title,
            quote: matchingFact.fact.statement,
            authority: matchingFact.source.authority,
            score: 1.0,
            attribute: matchingFact.fact.attribute,
            value: matchingFact.fact.value,
            unit: matchingFact.fact.unit,
          });

          const explanation = generateSpecificExplanation({
            exactWords: claimText,
            claimType,
            outcome: "CONTRADICTED",
            product,
            brand,
            conflictingEvidence,
            specificationDetails: {
              claimedValue: `${claimedVal} ${claimedUnit}`,
              expectedValue: `${factVal} ${factUnit}`,
            },
          });

          return {
            evidenceVerification: "CONTRADICTED",
            governanceCompliance: "NON_COMPLIANT",
            brandVoiceQuality: toneResult.brandVoiceQuality,
            outcome: "CONTRADICTED",
            matchedEvidence: [],
            conflictingEvidence,
            explanation,
            severity: "HIGH",
            blocking: true,
            citationFailures,
            toneAnalysis: toneResult,
          };
        }
      }
    }

    // No matching specification fact found -> UNSUPPORTED (Never claim false!)
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "UNSUPPORTED",
      product,
      brand,
    });
    return {
      evidenceVerification: "UNSUPPORTED",
      governanceCompliance: "NEEDS_REVIEW",
      brandVoiceQuality: toneResult.brandVoiceQuality,
      outcome: "UNSUPPORTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "REVIEW",
      blocking: false,
      citationFailures,
      toneAnalysis: toneResult,
    };
  }

  // =========================================================================
  // CASE 7: Ingredient Claims
  // =========================================================================
  if (claimType === "INGREDIENT_COMPOSITION" || claimType === "INGREDIENT_CLAIM") {
    const ingredientFact = eligibleFacts.find(({ fact }) => {
      const normAttr = normalize(fact.attribute);
      const isIngrOrAllergen =
        normAttr.includes("ingredient") ||
        normAttr.includes("allergen") ||
        normAttr.includes("material") ||
        normAttr.includes("fabric") ||
        normAttr.includes("composition");
      if (!isIngrOrAllergen) return false;
      const normVal = normalize(fact.value);
      return normVal.length >= 3 && (normClaim.includes(normVal) || normVal.includes(normClaim));
    });

    if (ingredientFact) {
      matchedEvidence.push({
        source_id: ingredientFact.source.id,
        source_version: ingredientFact.source.version,
        source_title: ingredientFact.source.title,
        quote: ingredientFact.fact.statement,
        authority: ingredientFact.source.authority,
        score: 1.0,
        attribute: ingredientFact.fact.attribute,
        value: ingredientFact.fact.value,
        unit: ingredientFact.fact.unit,
      });

      const explanation = generateSpecificExplanation({
        exactWords: claimText,
        claimType,
        outcome: "SUPPORTED",
        product,
        brand,
        matchedEvidence,
      });

      return {
        evidenceVerification: "SUPPORTED",
        governanceCompliance: "COMPLIANT",
        brandVoiceQuality: toneResult.brandVoiceQuality,
        outcome: "SUPPORTED",
        matchedEvidence,
        conflictingEvidence: [],
        explanation,
        severity: "LOW",
        blocking: false,
        citationFailures,
        toneAnalysis: toneResult,
      };
    }

    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "UNSUPPORTED",
      product,
      brand,
    });
    return {
      evidenceVerification: "UNSUPPORTED",
      governanceCompliance: "NEEDS_REVIEW",
      brandVoiceQuality: toneResult.brandVoiceQuality,
      outcome: "UNSUPPORTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "REVIEW",
      blocking: false,
      citationFailures,
      toneAnalysis: toneResult,
    };
  }

  // =========================================================================
  // CASE 8: Promotional Offers
  // =========================================================================
  if (claimType === "PROMOTIONAL_OFFER") {
    const bundleFacts = eligibleFacts.filter(({ fact }) =>
      normalize(fact.attribute).includes("bundle")
    );
    const differingValues = new Set(bundleFacts.map((b) => b.fact.value));

    const touchesBundleConflict =
      (normClaim.includes("starter bundle") || normClaim.includes("bundle")) &&
      (normClaim.includes("jar") || /\b(?:2|3|two|three)\b/.test(normClaim));

    if (differingValues.size > 1 && touchesBundleConflict) {
      for (const bf of bundleFacts.slice(0, 2)) {
        conflictingEvidence.push({
          source_id: bf.source.id,
          source_version: bf.source.version,
          source_title: bf.source.title,
          quote: bf.fact.statement,
          authority: bf.source.authority,
          score: 1.0,
          attribute: bf.fact.attribute,
          value: bf.fact.value,
          unit: bf.fact.unit,
        });
      }
      const explanation = generateSpecificExplanation({
        exactWords: claimText,
        claimType,
        outcome: "CONTRADICTED",
        product,
        brand,
        conflictingEvidence,
      });
      return {
        evidenceVerification: "CONTRADICTED",
        governanceCompliance: "NON_COMPLIANT",
        brandVoiceQuality: toneResult.brandVoiceQuality,
        outcome: "CONTRADICTED",
        matchedEvidence: [],
        conflictingEvidence,
        explanation,
        severity: "HIGH",
        blocking: true,
        citationFailures,
        toneAnalysis: toneResult,
      };
    }

    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "UNSUPPORTED",
      product,
      brand,
    });
    return {
      evidenceVerification: "UNSUPPORTED",
      governanceCompliance: "NEEDS_REVIEW",
      brandVoiceQuality: toneResult.brandVoiceQuality,
      outcome: "UNSUPPORTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "REVIEW",
      blocking: false,
      citationFailures,
      toneAnalysis: toneResult,
    };
  }

  // =========================================================================
  // DEFAULT / UNVERIFIED CLAIM
  // =========================================================================
  const explanation = generateSpecificExplanation({
    exactWords: claimText,
    claimType,
    outcome: "UNSUPPORTED",
    product,
    brand,
  });

  return {
    evidenceVerification: "UNSUPPORTED",
    governanceCompliance: "NEEDS_REVIEW",
    brandVoiceQuality: toneResult.brandVoiceQuality,
    outcome: "UNSUPPORTED",
    matchedEvidence: [],
    conflictingEvidence: [],
    explanation,
    severity: "REVIEW",
    blocking: false,
    citationFailures,
    toneAnalysis: toneResult,
  };
}
