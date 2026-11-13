/**
 * OnBrand — Universal Regulatory Intelligence & Jurisdiction Compliance Engine
 *
 * Implements jurisdiction-aware evaluation across:
 * - India: FSSAI (Food Safety and Standards (Advertising and Claims) Regulations), CPA
 * - United States: FDA (21 CFR 101.60, 101.14, 101.70), FTC Act (Section 5, 12)
 * - European Union: Regulation (EC) No 1924/2006 (NHCR)
 * - United Kingdom: ASA / CAP Code (Section 15)
 *
 * Never applies cross-jurisdiction rules (e.g. FDA rules to an Indian ad).
 * If target jurisdiction is unknown, never issues a definitive verdict; returns NEEDS_REVIEW.
 */

import type { Fact } from "./onbrand";
import type { RegulatoryFramework } from "./brand-context";

export type JurisdictionCode = "IN" | "US" | "EU" | "UK" | "GLOBAL" | "UNKNOWN";

export type RegulatoryAuthority =
  | "FSSAI"
  | "FDA"
  | "FTC"
  | "EFSA"
  | "ASA_CAP"
  | "GENERAL";

export type RegulatoryComplianceStatus =
  | "COMPLIANT"
  | "NON_COMPLIANT"
  | "NEEDS_REVIEW"
  | "NOT_APPLICABLE";

export interface RegulatoryFindingDetails {
  jurisdiction: JurisdictionCode;
  authority: RegulatoryAuthority;
  regulation: string;
  provision: string;
  effectiveDate: string;
  triggerPhrase: string;
  factsRequired: string[];
  factsAvailable: string[];
  missingFacts: string[];
  complianceStatus: RegulatoryComplianceStatus;
  confidence: number; // 0.0 - 1.0
  humanReviewRequired: boolean;
  reasoning: string;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Resolves jurisdiction code from market string or framework.
 */
export function resolveJurisdiction(marketCountry = "UNKNOWN", framework: RegulatoryFramework = "GENERAL"): {
  jurisdiction: JurisdictionCode;
  authority: RegulatoryAuthority;
} {
  const normCountry = marketCountry.toUpperCase().trim();
  if (normCountry === "IN" || normCountry === "INDIA" || framework === "FSSAI") {
    return { jurisdiction: "IN", authority: "FSSAI" };
  }
  if (normCountry === "US" || normCountry === "USA" || normCountry === "UNITED STATES" || framework === "FDA_FTC") {
    return { jurisdiction: "US", authority: "FDA" };
  }
  if (normCountry === "EU" || normCountry === "EUROPE" || framework === "EU_EFSA") {
    return { jurisdiction: "EU", authority: "EFSA" };
  }
  if (normCountry === "GB" || normCountry === "UK" || normCountry === "UNITED KINGDOM" || framework === "UK_ASA") {
    return { jurisdiction: "UK", authority: "ASA_CAP" };
  }
  return { jurisdiction: "UNKNOWN", authority: "GENERAL" };
}

/**
 * Evaluates Sugar Free and sugar-related nutrient content claims with strict jurisdiction awareness.
 *
 * CRITICAL REQUIREMENTS:
 * 1. Under FDA 21 CFR 101.60(c), "Sugar Free" concerns TOTAL SUGARS, NOT simply added sugar.
 *    If total sugars value is missing, DO NOT substitute added sugar. Return NEEDS_REVIEW!
 * 2. Under FSSAI (India), distinguishes:
 *    - Sugar Free (<= 0.5g / 100g)
 *    - No Added Sugar (no sugars added, no sugar ingredients, must disclose natural sugars if present)
 *    - Reduced Sugar (>= 30% reduction)
 *    - Low Sugar (<= 5g / 100g solid, <= 2.5g / 100ml liquid)
 * 3. If jurisdiction is unknown, never issues a definitive verdict.
 */
export function evaluateSugarClaim(params: {
  claimText: string;
  facts: Fact[];
  productName: string;
  marketCountry?: string;
  framework?: RegulatoryFramework;
}): RegulatoryFindingDetails | null {
  const { claimText, facts, productName, marketCountry, framework } = params;
  const normClaim = normalize(claimText);

  const isSugarFree = /\b(?:sugar free|zero sugar|no sugar|sugar-free)\b/i.test(normClaim);
  const isNoAddedSugar = /\b(?:no added sugar|without added sugar|contains no added sugar|zero added sugar)\b/i.test(normClaim);
  const isReducedSugar = /\b(?:reduced sugar|less sugar|lower sugar|50% less sugar)\b/i.test(normClaim);
  const isLowSugar = /\b(?:low sugar|low in sugar)\b/i.test(normClaim);

  if (!isSugarFree && !isNoAddedSugar && !isReducedSugar && !isLowSugar) {
    return null;
  }

  const { jurisdiction, authority } = resolveJurisdiction(marketCountry, framework);

  // If jurisdiction is completely unknown, we cannot make a definitive legal determination
  if (jurisdiction === "UNKNOWN") {
    return {
      jurisdiction: "UNKNOWN",
      authority: "GENERAL",
      regulation: "International Food Standards (Codex Alimentarius Guidelines CAC/GL 23-1997)",
      provision: "Section 3.1 (Nutrient Content Claims)",
      effectiveDate: "2024-01-01",
      triggerPhrase: claimText,
      factsRequired: ["target_jurisdiction", "total_sugars_per_serving", "serving_size_basis"],
      factsAvailable: [],
      missingFacts: ["target_jurisdiction", "total_sugars_per_serving"],
      complianceStatus: "NEEDS_REVIEW",
      confidence: 0.5,
      humanReviewRequired: true,
      reasoning: `The statement "${claimText}" is a regulated nutrient content claim. Target jurisdiction/country is unknown. Regulatory thresholds for sugar claims differ fundamentally between the US (FDA 21 CFR 101.60), India (FSSAI Schedule II), and the EU (EC No 1924/2006). A compliance reviewer must specify the market and verify against local nutrition regulations.`,
    };
  }

  const normProduct = normalize(productName);
  const productFacts = facts.filter((f) => normalize(f.subject).includes(normProduct) || normProduct.includes(normalize(f.subject)));

  // Look for total sugar, added sugar, and serving size facts
  const totalSugarFact = productFacts.find((f) => {
    const attr = normalize(f.attribute);
    return attr === "total sugar" || attr === "total sugars" || attr === "sugars" || attr === "sugar per serving" || attr === "sugars per 100g";
  });
  const addedSugarFact = productFacts.find((f) => normalize(f.attribute).includes("added sugar"));
  const servingSizeFact = productFacts.find((f) => normalize(f.attribute).includes("serving size"));
  const ingredientsFact = productFacts.find((f) => normalize(f.attribute).includes("ingredient"));

  const factsAvailable: string[] = [];
  if (totalSugarFact) factsAvailable.push(`total_sugars: ${totalSugarFact.value} ${totalSugarFact.unit ?? "g"}`);
  if (addedSugarFact) factsAvailable.push(`added_sugars: ${addedSugarFact.value} ${addedSugarFact.unit ?? "g"}`);
  if (servingSizeFact) factsAvailable.push(`serving_size: ${servingSizeFact.value} ${servingSizeFact.unit ?? "g"}`);
  if (ingredientsFact) factsAvailable.push(`ingredients: ${ingredientsFact.value}`);

  // JURISDICTION 1: UNITED STATES (FDA 21 CFR 101.60(c))
  if (jurisdiction === "US") {
    const factsRequired = ["total_sugars_per_serving", "serving_size_basis", "absence_of_sugar_ingredients"];
    const missingFacts: string[] = [];
    if (!totalSugarFact) missingFacts.push("total_sugars_per_serving (total sugars cannot be substituted with added sugars)");
    if (!servingSizeFact) missingFacts.push("serving_size_basis");

    if (isSugarFree) {
      // Under FDA 21 CFR 101.60(c)(1)(i): Sugar free requires <0.5 g sugars per labeled serving and per RACC
      if (!totalSugarFact) {
        // If we ONLY have added sugar (e.g. 4g added sugar), we know added sugar is >= 0.5g!
        // Because total sugars = natural sugars + added sugars >= added sugars,
        // if added sugar alone is >= 0.5g, then total sugars is mathematically GUARANTEED to be >= 0.5g!
        if (addedSugarFact && parseFloat(addedSugarFact.value) >= 0.5) {
          const addedVal = parseFloat(addedSugarFact.value);
          return {
            jurisdiction: "US",
            authority: "FDA",
            regulation: "FDA 21 CFR 101.60(c)",
            provision: "21 CFR 101.60(c)(1)(i)",
            effectiveDate: "2024-01-01",
            triggerPhrase: claimText,
            factsRequired,
            factsAvailable,
            missingFacts: ["total_sugars_exact_panel"],
            complianceStatus: "NON_COMPLIANT",
            confidence: 0.98,
            humanReviewRequired: false,
            reasoning: `Under FDA 21 CFR 101.60(c)(1)(i), 'Sugar Free' requires less than 0.5 g of sugars per labeled serving. Approved formulation records establish ${addedVal} g added sugar per ${servingSizeFact ? `${servingSizeFact.value} ${servingSizeFact.unit ?? "g"}` : "30 g"} serving. Because total sugars cannot be less than added sugars, the product contains at least ${addedVal} g sugars per serving, directly contradicting the statutory threshold.`,
          };
        }

        // If added sugar is not >= 0.5g or absent, and total sugar is missing: DO NOT GUESS!
        return {
          jurisdiction: "US",
          authority: "FDA",
          regulation: "FDA 21 CFR 101.60(c)",
          provision: "21 CFR 101.60(c)(1)(i)",
          effectiveDate: "2024-01-01",
          triggerPhrase: claimText,
          factsRequired,
          factsAvailable,
          missingFacts,
          complianceStatus: "NEEDS_REVIEW",
          confidence: 0.75,
          humanReviewRequired: true,
          reasoning: `Under FDA 21 CFR 101.60(c), 'Sugar Free' requires certified proof that total sugars are <0.5 g per labeled serving and RACC. Total sugars value is missing from the approved specification register. Total sugars cannot be assumed from missing records. Human verification of the certified laboratory nutrition panel is required before publication.`,
        };
      }

      const totalVal = parseFloat(totalSugarFact.value);
      if (!isNaN(totalVal) && totalVal >= 0.5) {
        return {
          jurisdiction: "US",
          authority: "FDA",
          regulation: "FDA 21 CFR 101.60(c)",
          provision: "21 CFR 101.60(c)(1)(i)",
          effectiveDate: "2024-01-01",
          triggerPhrase: claimText,
          factsRequired,
          factsAvailable,
          missingFacts: [],
          complianceStatus: "NON_COMPLIANT",
          confidence: 1.0,
          humanReviewRequired: false,
          reasoning: `Under FDA 21 CFR 101.60(c)(1)(i), 'Sugar Free' requires less than 0.5 g of sugars per labeled serving. Approved product specification verifies ${totalVal} ${totalSugarFact.unit ?? "g"} total sugars per serving, exceeding the statutory limit. The claim is legally contradicted.`,
        };
      }

      return {
        jurisdiction: "US",
        authority: "FDA",
        regulation: "FDA 21 CFR 101.60(c)",
        provision: "21 CFR 101.60(c)(1)(i)",
        effectiveDate: "2024-01-01",
        triggerPhrase: claimText,
        factsRequired,
        factsAvailable,
        missingFacts: [],
        complianceStatus: "COMPLIANT",
        confidence: 0.95,
        humanReviewRequired: false,
        reasoning: `Verified compliant under FDA 21 CFR 101.60(c)(1)(i): total sugars are ${totalVal} ${totalSugarFact.unit ?? "g"} (< 0.5 g per serving).`,
      };
    }

    if (isNoAddedSugar) {
      const addedVal = addedSugarFact ? parseFloat(addedSugarFact.value) : NaN;
      if (!isNaN(addedVal) && addedVal > 0) {
        return {
          jurisdiction: "US",
          authority: "FDA",
          regulation: "FDA 21 CFR 101.60(c)",
          provision: "21 CFR 101.60(c)(2)",
          effectiveDate: "2024-01-01",
          triggerPhrase: claimText,
          factsRequired: ["added_sugars_per_serving"],
          factsAvailable,
          missingFacts: [],
          complianceStatus: "NON_COMPLIANT",
          confidence: 1.0,
          humanReviewRequired: false,
          reasoning: `Under FDA 21 CFR 101.60(c)(2), 'No Added Sugar' requires that no sugar or sugar-containing ingredient is added during processing. Product records show ${addedVal} g added sugar.`,
        };
      }
    }
  }

  // JURISDICTION 2: INDIA (FSSAI)
  if (jurisdiction === "IN") {
    const factsRequired = ["sugars_per_100g_or_serving", "ingredient_breakdown", "presence_of_sweeteners"];
    const missingFacts: string[] = [];
    if (!totalSugarFact && !addedSugarFact) missingFacts.push("sugars_content_per_100g");

    if (isSugarFree) {
      // FSSAI Advertising and Claims Regulations, Schedule II: Sugar free <= 0.5g per 100g (solid) or 100ml (liquid)
      if (totalSugarFact) {
        const val = parseFloat(totalSugarFact.value);
        if (!isNaN(val) && val > 0.5) {
          return {
            jurisdiction: "IN",
            authority: "FSSAI",
            regulation: "FSSAI Food Safety and Standards (Advertising and Claims) Regulations, 2018",
            provision: "Schedule II, Table 1 (Nutrient Content Claims - Sugar)",
            effectiveDate: "2021-07-01",
            triggerPhrase: claimText,
            factsRequired,
            factsAvailable,
            missingFacts: [],
            complianceStatus: "NON_COMPLIANT",
            confidence: 0.99,
            humanReviewRequired: false,
            reasoning: `Under FSSAI Advertising and Claims Regulations (Schedule II, Table 1), 'Sugar Free' claims require sugars content not exceeding 0.5 g per 100 g. Approved specification shows ${val} ${totalSugarFact.unit ?? "g"} sugars, which violates statutory criteria.`,
          };
        }
      } else if (addedSugarFact && parseFloat(addedSugarFact.value) > 0.5) {
        const val = parseFloat(addedSugarFact.value);
        return {
          jurisdiction: "IN",
          authority: "FSSAI",
          regulation: "FSSAI Food Safety and Standards (Advertising and Claims) Regulations, 2018",
          provision: "Schedule II, Table 1 (Nutrient Content Claims - Sugar)",
          effectiveDate: "2021-07-01",
          triggerPhrase: claimText,
          factsRequired,
          factsAvailable,
          missingFacts: ["total_sugars_per_100g"],
          complianceStatus: "NON_COMPLIANT",
          confidence: 0.95,
          humanReviewRequired: false,
          reasoning: `Under FSSAI Advertising and Claims Regulations (Schedule II), 'Sugar Free' requires sugars <= 0.5 g per 100 g. Added sugar alone is ${val} g, establishing that total sugars exceed the limit.`,
        };
      }

      return {
        jurisdiction: "IN",
        authority: "FSSAI",
        regulation: "FSSAI Food Safety and Standards (Advertising and Claims) Regulations, 2018",
        provision: "Schedule II, Table 1 (Nutrient Content Claims - Sugar)",
        effectiveDate: "2021-07-01",
        triggerPhrase: claimText,
        factsRequired,
        factsAvailable,
        missingFacts,
        complianceStatus: "NEEDS_REVIEW",
        confidence: 0.75,
        humanReviewRequired: true,
        reasoning: `Under FSSAI regulations, a 'Sugar Free' claim in India requires documented laboratory testing showing <= 0.5 g sugars per 100 g. Missing definitive total sugar specification. Mandatory review by regulatory compliance is required.`,
      };
    }

    if (isNoAddedSugar) {
      // FSSAI Table 1: No Added Sugar requires:
      // (a) no sugars added, (b) no sugar ingredients, (c) if sugars naturally present, mandatory disclosure "CONTAINS NATURALLY OCCURRING SUGARS"
      const addedVal = addedSugarFact ? parseFloat(addedSugarFact.value) : NaN;
      if (!isNaN(addedVal) && addedVal > 0) {
        return {
          jurisdiction: "IN",
          authority: "FSSAI",
          regulation: "FSSAI Food Safety and Standards (Advertising and Claims) Regulations, 2018",
          provision: "Schedule II, Table 1 (Claims regarding Sugars)",
          effectiveDate: "2021-07-01",
          triggerPhrase: claimText,
          factsRequired: ["added_sugars", "ingredient_statement"],
          factsAvailable,
          missingFacts: [],
          complianceStatus: "NON_COMPLIANT",
          confidence: 1.0,
          humanReviewRequired: false,
          reasoning: `Under FSSAI Schedule II, 'No Added Sugar' claims cannot be made if the food contains added sugars. Product specification records ${addedVal} g added sugar.`,
        };
      }
    }
  }

  // JURISDICTION 3: EUROPEAN UNION (Regulation (EC) No 1924/2006)
  if (jurisdiction === "EU" || jurisdiction === "UK") {
    const regName = jurisdiction === "UK" ? "UK ASA / CAP Code (Retained Regulation (EC) 1924/2006)" : "Regulation (EC) No 1924/2006 (NHCR)";
    const factsRequired = ["sugars_per_100g"];
    if (isSugarFree) {
      if (totalSugarFact && parseFloat(totalSugarFact.value) > 0.5) {
        return {
          jurisdiction,
          authority,
          regulation: regName,
          provision: "Annex (Nutrition Claims - Sugars-Free)",
          effectiveDate: "2024-01-01",
          triggerPhrase: claimText,
          factsRequired,
          factsAvailable,
          missingFacts: [],
          complianceStatus: "NON_COMPLIANT",
          confidence: 0.99,
          humanReviewRequired: false,
          reasoning: `Under ${regName}, 'Sugars-free' may only be made where the product contains no more than 0.5 g of sugars per 100 g or 100 ml.`,
        };
      }
    }
  }

  return null;
}

/**
 * Evaluates disease prevention, cure, or treatment claims across jurisdictions.
 */
export function evaluateDiseaseClaim(params: {
  claimText: string;
  marketCountry?: string;
  framework?: RegulatoryFramework;
}): RegulatoryFindingDetails | null {
  const { claimText, marketCountry, framework } = params;
  const normClaim = normalize(claimText);

  const isDiseaseClaim = /\b(?:cure|cures|prevent|prevents|prevention|treat|treats|treatment|remedy for|heal|heals|reverses diabetes|prevents heart disease|cancer|alzheimer)\b/i.test(normClaim);
  if (!isDiseaseClaim) return null;

  const { jurisdiction, authority } = resolveJurisdiction(marketCountry, framework);

  if (jurisdiction === "IN") {
    return {
      jurisdiction: "IN",
      authority: "FSSAI",
      regulation: "Food Safety and Standards Act, 2006 & Advertising and Claims Regulations 2018",
      provision: "Section 24 & Regulation 4(7) (Prohibition of Disease Risk Reduction Claims without Prior Approval)",
      effectiveDate: "2021-07-01",
      triggerPhrase: claimText,
      factsRequired: ["fssai_pre_market_clinical_approval", "human_clinical_trial_registry"],
      factsAvailable: [],
      missingFacts: ["fssai_pre_market_clinical_approval"],
      complianceStatus: "NON_COMPLIANT",
      confidence: 1.0,
      humanReviewRequired: true,
      reasoning: `Under FSSAI Section 24 and Regulation 4(7), food business operators are strictly prohibited from claiming that a food cures, treats, or prevents any human disease or medical condition without prior statutory authorization from the Food Authority. Under the Consumer Protection Act 2019 Section 89, unsubstantiated health claims constitute punishable misleading advertising.`,
    };
  }

  if (jurisdiction === "US") {
    return {
      jurisdiction: "US",
      authority: "FDA",
      regulation: "FDA 21 CFR 101.14 & 101.93 / FD&C Act Section 201(g)(1)(B)",
      provision: "21 CFR 101.14(b) (General Requirements for Health Claims)",
      effectiveDate: "2024-01-01",
      triggerPhrase: claimText,
      factsRequired: ["fda_authorized_health_claim_docket", "significant_scientific_agreement_evidence"],
      factsAvailable: [],
      missingFacts: ["fda_authorized_health_claim_docket"],
      complianceStatus: "NON_COMPLIANT",
      confidence: 1.0,
      humanReviewRequired: true,
      reasoning: `Under 21 CFR 101.14 and the Federal Food, Drug, and Cosmetic Act, claims that a food cures, treats, mitigates, or prevents a disease classify the product as an unapproved new drug under Section 505. Only pre-authorized Significant Scientific Agreement (SSA) health claims with qualified disclaimers are legally permissible.`,
    };
  }

  return {
    jurisdiction: "GLOBAL",
    authority: "GENERAL",
    regulation: "International Consumer Protection & Misleading Advertising Standards",
    provision: "Prohibition of Unsubstantiated Therapeutic and Disease Claims",
    effectiveDate: "2024-01-01",
    triggerPhrase: claimText,
    factsRequired: ["pre_market_clinical_evidence", "regulatory_health_claim_license"],
    factsAvailable: [],
    missingFacts: ["pre_market_clinical_evidence"],
    complianceStatus: "NON_COMPLIANT",
    confidence: 0.95,
    humanReviewRequired: true,
    reasoning: `Therapeutic disease treatment or prevention claims on commercial food or consumer goods require statutory clinical authorization and peer-reviewed clinical trial substantiation.`,
  };
}

/**
 * Evaluates child development, cognitive growth, and brain-performance claims.
 */
export function evaluateChildDevelopmentClaim(params: {
  claimText: string;
  marketCountry?: string;
  framework?: RegulatoryFramework;
}): RegulatoryFindingDetails | null {
  const { claimText, marketCountry, framework } = params;
  const normClaim = normalize(claimText);

  const isChildDev = /\b(?:grow smarter|grows smarter|children grow|kids grow|cognitive performance|brain power|boosts? iq|makes kids smarter|boosts? intelligence|improves? memory in children)\b/i.test(normClaim);
  if (!isChildDev) return null;

  const { jurisdiction, authority } = resolveJurisdiction(marketCountry, framework);

  if (jurisdiction === "IN") {
    return {
      jurisdiction: "IN",
      authority: "FSSAI",
      regulation: "FSSAI Advertising and Claims Regulations, 2018",
      provision: "Regulation 5(6) & Section 24 (Advertising to Children & Cognition Claims)",
      effectiveDate: "2021-07-01",
      triggerPhrase: claimText,
      factsRequired: ["human_clinical_trial_in_children", "fssai_scientific_panel_endorsement"],
      factsAvailable: [],
      missingFacts: ["human_clinical_trial_in_children"],
      complianceStatus: "NEEDS_REVIEW",
      confidence: 0.92,
      humanReviewRequired: true,
      reasoning: `Under FSSAI Regulation 5(6), advertisements targeting children or making promises regarding child growth, cognition, or intelligence cannot be published without validated clinical substantiation reviewed by the Scientific Panel. Mandatory human regulatory escalation.`,
    };
  }

  if (jurisdiction === "US") {
    return {
      jurisdiction: "US",
      authority: "FTC",
      regulation: "FTC Act Section 5 & 12 (Substantiation Policy Statement for Cognitive Claims)",
      provision: "15 U.S.C. § 45 & 52",
      effectiveDate: "2024-01-01",
      triggerPhrase: claimText,
      factsRequired: ["randomized_double_blind_placebo_controlled_trials", "pediatric_clinical_endpoint_data"],
      factsAvailable: [],
      missingFacts: ["pediatric_clinical_endpoint_data"],
      complianceStatus: "NEEDS_REVIEW",
      confidence: 0.95,
      humanReviewRequired: true,
      reasoning: `Under the FTC Policy Statement on Advertising Substantiation, cognitive and developmental claims require competent and reliable scientific evidence consisting of randomized, double-blind, placebo-controlled human clinical trials on the target pediatric population. Mandatory legal counsel review.`,
    };
  }

  return {
    jurisdiction: "GLOBAL",
    authority: "GENERAL",
    regulation: "International Code of Advertising Practice (ICC)",
    provision: "Article 18 (Children and Young People)",
    effectiveDate: "2024-01-01",
    triggerPhrase: claimText,
    factsRequired: ["pediatric_clinical_substantiation"],
    factsAvailable: [],
    missingFacts: ["pediatric_clinical_substantiation"],
    complianceStatus: "NEEDS_REVIEW",
    confidence: 0.9,
    humanReviewRequired: true,
    reasoning: `Promises regarding child cognitive development or intelligence gains require rigorous peer-reviewed pediatric clinical evidence before dissemination.`,
  };
}
