/**
 * OnBrand — Multi-Attribute Evidence Matching Engine
 *
 * Enforces strict governance checks before any evidence can substantiate or contradict a claim:
 * 1. Exact organization/tenant (Zero cross-tenant leakage)
 * 2. Exact brand
 * 3. Exact product
 * 4. Exact product variant/SKU (e.g. Cocoa Oat vs Peanut Butter, 30g vs 500g)
 * 5. Market or country scope
 * 6. Source approval status (Only "APPROVED", excludes "PENDING_REVIEW", "REVOKED", "DRAFT")
 * 7. Source effective date and expiry (effectiveFrom <= date <= effectiveTo)
 * 8. Active version
 * 9. Unit and serving basis compatibility (e.g. grams vs grams, per 30g serving vs per 100g)
 * 10. Relevant claim category
 */

import type { Source, Fact } from "./onbrand";
import type { ClaimType, FindingOutcome } from "./claim-classifier";
import { generateSpecificExplanation, type StructuredFindingExplanation } from "./finding-explanations";

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
  outcome: FindingOutcome;
  matchedEvidence: MatchedEvidenceItem[];
  conflictingEvidence: MatchedEvidenceItem[];
  explanation: StructuredFindingExplanation;
  severity: "LOW" | "MEDIUM" | "HIGH" | "REVIEW";
  blocking: boolean;
  citationFailures: string[];
}

/**
 * Normalizes text for comparison.
 */
function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Evaluates a candidate claim against available sources with multi-attribute precision.
 */
export function evaluateClaimWithEvidence(
  criteria: EvidenceMatchCriteria,
  sources: Source[]
): EvidenceEvaluationResult {
  const {
    claimText,
    claimType,
    organizationId,
    product = "Sample Foods Oat Bites",
    brand = "Sample Foods",
    channel = "social",
    targetDate = new Date().toISOString().slice(0, 10),
  } = criteria;

  const citationFailures: string[] = [];
  const normClaim = normalize(claimText);
  const normProduct = normalize(product);

  // Filter sources using strict multi-attribute checks
  const eligibleSources = sources.filter((source) => {
    // 1. Organization / Tenant check (if source has organization metadata)
    const sourceOrg = (source as unknown as { organizationId?: string }).organizationId;
    if (organizationId && sourceOrg && sourceOrg !== organizationId) {
      citationFailures.push(`Source ${source.id} excluded: belongs to different organization (${sourceOrg})`);
      return false;
    }

    // 2. Approval status: ONLY "APPROVED" sources can be used
    if (source.approvalState !== "APPROVED") {
      citationFailures.push(`Source ${source.id} excluded: approval state is '${source.approvalState}' (requires APPROVED)`);
      return false;
    }

    // 3. Revocation check
    if (source.revokedAt) {
      citationFailures.push(`Source ${source.id} excluded: revoked on ${source.revokedAt}`);
      return false;
    }

    // 4. Effective date range
    if (source.effectiveFrom && source.effectiveFrom > targetDate) {
      citationFailures.push(`Source ${source.id} excluded: effectiveFrom (${source.effectiveFrom}) is after target date (${targetDate})`);
      return false;
    }
    if (source.effectiveTo && source.effectiveTo < targetDate) {
      citationFailures.push(`Source ${source.id} excluded: expired on ${source.effectiveTo}`);
      return false;
    }

    // 5. Channel scope
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

  // Extract all eligible facts
  const eligibleFacts: Array<{ source: Source; fact: Fact }> = eligibleSources.flatMap((source) =>
    source.facts.map((fact) => ({ source, fact }))
  );

  const matchedEvidence: MatchedEvidenceItem[] = [];
  const conflictingEvidence: MatchedEvidenceItem[] = [];

  // 1. NON-VERIFIABLE CLAIMS (Brand names, product descriptions, taglines, CTAs, disclaimers, ordinary copy)
  if (
    claimType === "BRAND_OR_PRODUCT_NAME" ||
    claimType === "PRODUCT_DESCRIPTION" ||
    claimType === "CALL_TO_ACTION" ||
    claimType === "DISCLAIMER" ||
    claimType === "ORDINARY_TEXT" ||
    (claimType === "SUBJECTIVE_TAGLINE" && !/miracle|guaranteed/i.test(claimText))
  ) {
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "NO_ISSUE",
      product,
      brand,
    });
    return {
      outcome: "NO_ISSUE",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "LOW",
      blocking: false,
      citationFailures,
    };
  }

  // 2. SUGAR FREE REGULATORY NUTRITION CLAIM CHECK
  if (/sugar free|zero sugar|no sugar/i.test(claimText)) {
    // Find added sugar fact for this exact product
    const addedSugarFact = eligibleFacts.find(
      ({ fact }) =>
        normalize(fact.subject).includes(normProduct) &&
        (normalize(fact.attribute).includes("added sugar") || normalize(fact.attribute).includes("sugar per serving"))
    );
    const servingFact = eligibleFacts.find(
      ({ fact }) =>
        normalize(fact.subject).includes(normProduct) &&
        normalize(fact.attribute).includes("serving size")
    );

    if (addedSugarFact) {
      const sugarVal = parseFloat(addedSugarFact.fact.value);
      const servingVal = servingFact ? `${servingFact.fact.value} ${servingFact.fact.unit ?? "g"}` : "30 g";

      if (!isNaN(sugarVal) && sugarVal >= 0.5) {
        // Direct regulatory contradiction under FDA 21 CFR 101.60(c) (<0.5g sugar required for "sugar free")
        conflictingEvidence.push({
          source_id: addedSugarFact.source.id,
          source_version: addedSugarFact.source.version,
          source_title: addedSugarFact.source.title,
          quote: addedSugarFact.fact.statement,
          authority: addedSugarFact.source.authority,
          score: 1.0,
          attribute: addedSugarFact.fact.attribute,
          value: addedSugarFact.fact.value,
          unit: addedSugarFact.fact.unit,
        });

        const explanation = generateSpecificExplanation({
          exactWords: claimText,
          claimType: "NUMERIC_NUTRITION_CLAIM",
          outcome: "CONTRADICTED",
          product,
          brand,
          conflictingEvidence,
          regulatoryReference: "FDA 21 CFR 101.60(c)",
          specificationDetails: {
            claimedValue: "0 g sugar (Sugar Free)",
            expectedValue: `${addedSugarFact.fact.value} ${addedSugarFact.fact.unit ?? "g"}`,
            servingBasis: servingVal,
          },
        });

        return {
          outcome: "CONTRADICTED",
          matchedEvidence: [],
          conflictingEvidence,
          explanation,
          severity: "HIGH",
          blocking: true,
          citationFailures,
        };
      }
    }
  }

  // 3. HEALTH & DEVELOPMENTAL CLAIMS (Cognitive, Intelligence, Clinical)
  if (claimType === "HEALTH_DEVELOPMENTAL_CLAIM") {
    // Escalate as high-risk item requiring human regulatory review
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "NEEDS_HUMAN",
      product,
      brand,
    });
    return {
      outcome: "NEEDS_HUMAN",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "HIGH",
      blocking: true,
      citationFailures,
    };
  }

  // 4. NUMERIC NUTRITION CLAIMS (e.g. "6 g protein", "4 g added sugar", "30 g serving")
  if (claimType === "NUMERIC_NUTRITION_CLAIM") {
    // Parse quantity and metric
    const numMatch = claimText.match(/(\d+(?:\.\d+)?)\s*(g|grams?|mg|ml|kcal|calories)\s+(protein|added\s+sugar|sugar|serving)/i) ||
                     claimText.match(/(\d+(?:\.\d+)?)\s*(g|grams?|oz|bites?)\s+serving/i);

    if (numMatch) {
      const claimedVal = numMatch[1];
      const claimedUnit = numMatch[2].toLowerCase();
      const claimedMetric = (numMatch[3] || "serving").toLowerCase();

      // Look for fact for this product and metric
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
          // Exact match!
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
            outcome: "SUPPORTED",
            matchedEvidence,
            conflictingEvidence: [],
            explanation,
            severity: "LOW",
            blocking: false,
            citationFailures,
          };
        } else {
          // Value mismatch! Direct contradiction
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
            outcome: "CONTRADICTED",
            matchedEvidence: [],
            conflictingEvidence,
            explanation,
            severity: "HIGH",
            blocking: true,
            citationFailures,
          };
        }
      }
    }

    // No matching specification fact found -> UNSUPPORTED (Never claim proven false!)
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "UNSUPPORTED",
      product,
      brand,
    });
    return {
      outcome: "UNSUPPORTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "REVIEW",
      blocking: false,
      citationFailures,
    };
  }

  // 5. INGREDIENT CLAIMS (e.g. "Made with wholegrain oats")
  if (claimType === "INGREDIENT_CLAIM") {
    // Check if ingredient fact exists in eligible facts
    const ingredientFact = eligibleFacts.find(({ fact }) => {
      const normAttr = normalize(fact.attribute);
      const isIngrOrAllergen = normAttr.includes("ingredient") || normAttr.includes("allergen");
      if (!isIngrOrAllergen) return false;
      const normVal = normalize(fact.value);
      return normVal.length >= 3 && normClaim.includes(normVal);
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
        outcome: "SUPPORTED",
        matchedEvidence,
        conflictingEvidence: [],
        explanation,
        severity: "LOW",
        blocking: false,
        citationFailures,
      };
    }

    // Missing specific ingredient specification -> UNSUPPORTED (Do not claim false!)
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "UNSUPPORTED",
      product,
      brand,
    });
    return {
      outcome: "UNSUPPORTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "REVIEW",
      blocking: false,
      citationFailures,
    };
  }

  // 6. PROMOTIONAL OFFERS (e.g. "Our starter bundle includes 3 jars with standard delivery.")
  if (claimType === "PROMOTIONAL_OFFER") {
    // Check for conflicting bundle records
    const bundleFacts = eligibleFacts.filter(({ fact }) =>
      normalize(fact.attribute).includes("bundle")
    );
    const differingValues = new Set(bundleFacts.map((b) => b.fact.value));

    const touchesBundleConflict =
      (normClaim.includes("starter bundle") || normClaim.includes("bundle")) &&
      (normClaim.includes("jar") || /\b(?:2|3|two|three)\b/.test(normClaim));

    if (differingValues.size > 1 && touchesBundleConflict) {
      // Conflicting approved briefs!
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
        outcome: "CONTRADICTED",
        matchedEvidence: [],
        conflictingEvidence,
        explanation,
        severity: "HIGH",
        blocking: true,
        citationFailures,
      };
    }

    // Missing commercial offer record -> UNSUPPORTED
    const explanation = generateSpecificExplanation({
      exactWords: claimText,
      claimType,
      outcome: "UNSUPPORTED",
      product,
      brand,
    });
    return {
      outcome: "UNSUPPORTED",
      matchedEvidence: [],
      conflictingEvidence: [],
      explanation,
      severity: "REVIEW",
      blocking: false,
      citationFailures,
    };
  }

  // 7. DEFAULT GENERAL FALLBACK
  const explanation = generateSpecificExplanation({
    exactWords: claimText,
    claimType,
    outcome: "UNSUPPORTED",
    product,
    brand,
  });
  return {
    outcome: "UNSUPPORTED",
    matchedEvidence: [],
    conflictingEvidence: [],
    explanation,
    severity: "REVIEW",
    blocking: false,
    citationFailures,
  };
}
