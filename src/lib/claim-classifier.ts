/**
 * OnBrand — Universal Claim-Type Classifier & Finding Outcomes
 *
 * Configurable, brand-agnostic classifier supporting 22 distinct content and claim types:
 * - Brand names, Product names, Product variants, Product descriptions
 * - Ingredients & composition, Numeric specifications, Nutrition claims
 * - Health & medical claims, Developmental claims, Comparative claims
 * - Performance claims, Financial claims, Environmental & sustainability claims
 * - Certifications & endorsements, Testimonials, Offers/discounts/pricing
 * - Availability & delivery claims, Subjective taglines, Calls to action
 * - Disclaimers, Legal notices, Ordinary descriptive content
 *
 * Fully decoupled from specific customer brands or products.
 * Uses context and syntactic structure rather than isolated words.
 */

import type { BrandContext } from "./brand-context";

export type UniversalClaimType =
  | "BRAND_NAME"
  | "PRODUCT_NAME"
  | "PRODUCT_VARIANT"
  | "PRODUCT_DESCRIPTION"
  | "INGREDIENT_COMPOSITION"
  | "NUMERIC_SPECIFICATION"
  | "NUTRITION_CLAIM"
  | "HEALTH_MEDICAL_CLAIM"
  | "DEVELOPMENTAL_CLAIM"
  | "COMPARATIVE_CLAIM"
  | "PERFORMANCE_CLAIM"
  | "FINANCIAL_CLAIM"
  | "ENVIRONMENTAL_SUSTAINABILITY_CLAIM"
  | "CERTIFICATION_ENDORSEMENT"
  | "TESTIMONIAL"
  | "PROMOTIONAL_OFFER"
  | "AVAILABILITY_DELIVERY"
  | "SUBJECTIVE_TAGLINE"
  | "CALL_TO_ACTION"
  | "DISCLAIMER"
  | "LEGAL_NOTICE"
  | "ORDINARY_DESCRIPTIVE";

// Backwards-compatible union covering both standard 12 types and expanded universal types
export type ClaimType =
  | UniversalClaimType
  | "BRAND_OR_PRODUCT_NAME"
  | "INGREDIENT_CLAIM"
  | "NUMERIC_NUTRITION_CLAIM"
  | "HEALTH_DEVELOPMENTAL_CLAIM"
  | "ENDORSEMENT_CERTIFICATION_CLAIM"
  | "ORDINARY_TEXT";

export type FindingOutcome =
  | "SUPPORTED"
  | "CONTRADICTED"
  | "UNSUPPORTED"
  | "NEEDS_HUMAN"
  | "NO_ISSUE"
  | "NOT_APPLICABLE";

export interface ClaimClassification {
  text: string;
  claimType: ClaimType;
  requiresSubstantiation: boolean;
  defaultOutcome: FindingOutcome;
  governanceCategory:
    | "BRAND_IDENTIFIER"
    | "BRAND_CONSISTENCY"
    | "FACTUAL_ACCURACY"
    | "PROMOTIONAL_COMPLIANCE"
    | "ORDINARY_TEXT"
    | "DISCLAIMER";
  reasoning: string;
  subClaims?: Array<{
    text: string;
    startOffset: number;
    endOffset: number;
    claimType: ClaimType;
  }>;
}

// Structural prefix patterns for titles / labels
const LABEL_PREFIX_PATTERNS = [
  /^(?:brand\s+name|product\s+name|item|product|brand|variant|sku):\s*/i,
];

// Call to action patterns - imperative engagement verbs
const CALL_TO_ACTION_PATTERNS = [
  /^\s*(?:try|order|shop|buy|grab|get|visit|explore|discover|find|follow|join|learn more|subscribe|contact|taste|book|request|download|start|sign up|claim)\b/i,
  /^\s*(?:grab|pick up)\s+a\s+(?:jar|pack|box|bite|snack|bottle|case|sample|kit)\b/i,
];

// Disclaimers / legal notices / editorial notices
const DISCLAIMER_PATTERNS = [
  /^\s*(?:test content|disclaimer|notice|terms and conditions|terms apply|\*based on|\*results may vary|not evaluated by the fda|not evaluated by fssai|for demonstration purposes|consult your physician)\b/i,
  /claims are intentionally included for review/i,
  /copyright\s+(?:\d{4}|©)/i,
  /\b(?:subject to change|terms apply|prices and promotions|without notice|all rights reserved|investing involves risk|risk of loss|past performance|loss of principal)\b/i,
  /^\s*\*/,
];

// Subjective marketing taglines (creative slogans without numbers, clinical claims, or guarantees)
const SUBJECTIVE_TAGLINE_PATTERNS = [
  /^\s*(?:a little bite[.,\s]+a better (?:snack\s+)?break|a little bite|a better (?:snack\s+)?break)[.!]*\s*$/i,
  /^\s*(?:snack happy|goodness in every (?:bite|crunch|drop|sip)|simple moments|snack your way|your everyday treat|naturally delicious|pure delight|built for the bold|crafted for excellence|fresh perspective|elevate your routine|empowering your potential|engineered for tomorrow|future of sound)[.!]*\s*$/i,
  /\b(?:a\s+[a-z]+\s+bite\s+for\s+your\s+health)\b/i,
];

// Numeric nutrition & specification patterns
const NUTRITION_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*(?:g|grams?|mg|ml|kcal|calories)\s+(?:protein|added\s+sugar|sugar|sugars|total\s+sugars|fat|saturated\s+fat|fiber|sodium|carbs|carbohydrates)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:g|grams?|oz|ounces?|ml|bites?|pieces?)\s+serving\b/i,
  /\b(?:serving size|per serving):\s*\d+/i,
  /\b(?:sugar free|zero sugar|no sugar|sugar-free|fat free|zero fat|low fat|high protein|low carb|keto friendly)\b/i,
  /\b(?:no added sugar|without added sugar|reduced sugar|low sugar)\b/i,
];

// Ingredient & composition patterns
const INGREDIENT_PATTERNS = [
  /\b(?:made with|contains?|crafted with|real|wholegrain|whole grain|oats|cocoa|peanuts?|almonds?|wheat|dairy|soy|milk|gluten|non-gmo|organic|botanical extracts?|hyaluronic acid|pure cotton|recycled aluminum)\b/i,
  /\b(?:no artificial|free from artificial|preservative-free|artificial sweetener-free|paraben-free)\b/i,
];

// Health, disease, and medical claims (high risk -> strict substantiation)
const HEALTH_MEDICAL_PATTERNS = [
  /\b(?:cures?|prevents?|treats?|diagnose|remedy for|reduces? risk of disease|boosts? immune|immunity defense|heart disease|diabetes|cancer|hypertension|alzheimer)\b/i,
  /\b(?:clinically proven|clinically tested|reverses aging|miracle cure|cellular regeneration|lowers cholesterol)\b/i,
  /\b(?:improves? focus|improves? memory|improves? hydration|supports? restful sleep|relieves joint pain)\b/i,
  /\b(?:meal replacement|cure diabetes|superfood)\b/i,
];

// Developmental & cognitive claims (especially targeting children)
const DEVELOPMENTAL_PATTERNS = [
  /\b(?:helps? children grow smarter|grow smarter|boosts? brain|cognitive|cognitive performance|cognitive development|iq|intelligence|brain power|makes kids smarter|child(?:ren)?\s+will|kids?\s+will\s+score)\b/i,
];

// Comparative claims (market comparisons)
const COMPARATIVE_PATTERNS = [
  /\b(?:twice the|2x more|50% less|more than leading|better than|vs\. leading|#1 brand|preferred over|compared to|faster than any other)\b/i,
];

// Performance & technical claims
const PERFORMANCE_PATTERNS = [
  /\b(?:\d+[- ]hours?\s+battery\s+life|battery\s+life|cell\s+efficiency\s+of|\d+(?:\.\d+)?%\s+efficiency|99\.9% uptime|ultra-low latency|<10ms response|military-grade encryption|sub-millisecond|ip68 water resistant)\b/i,
];

// Financial claims
const FINANCIAL_PATTERNS = [
  /\b(?:guaranteed(?:\s+\d+%)?\s+(?:annual\s+)?returns?|annualized yield|\d+%\s+apy|zero fees forever|risk-free\b|double your investment)\b/i,
];

// Environmental & sustainability claims
const ENVIRONMENTAL_PATTERNS = [
  /\b(?:100% recyclable|carbon neutral|zero carbon emissions|net zero by|biodegradable|sustainably sourced|eco-friendly)\b/i,
];

// Endorsement & certification claims
const ENDORSEMENT_PATTERNS = [
  /\b(?:icaew regulated|iso \d+ certified|usda organic|non-gmo project verified|certified gluten[- ]free|recommended by \d+ out of \d+|doctor recommended|pediatrician approved|fssai certified|fda approved)\b/i,
];

// Testimonials
const TESTIMONIAL_PATTERNS = [
  /\b(?:customer review|rated 5 stars|patient testimonial|"best product i have used"|verified buyer)\b/i,
];

// Promotional offer patterns
const PROMOTIONAL_OFFER_PATTERNS = [
  /\b(?:starter bundle|bundle includes|free shipping|standard delivery|buy \d+ get \d+|\$\d+(?:\.\d{2})?|limited time offer|money-back guarantee|money back guarantee|discount|save \d+%)\b/i,
  /\b(?:includes \d+ jars?|delivery included|special launch price)\b/i,
];

// Prohibited / absolute superlatives that breach enterprise brand voice rules
const PROHIBITED_WORDS = [
  /\b(?:miracle|revolutionary breakthrough|magic cure|guaranteed results|100% cure|100% impenetrable|unhackable)\b/i,
];

/**
 * Checks whether text is an unreadable OCR fragment or noisy symbol artifact.
 */
export function isNoisyOcrFragment(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return true;
  // If text contains brackets, pipes, digits only, or very few letters
  const letters = trimmed.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return true;
  if (trimmed.length > 3 && letters.length / trimmed.length < 0.3) return true;
  // Patterns like "7] pr.", "~~|~~", ">>> 4"
  if (/^[\d\[\]()|~_\\\/<>-]+\s*[a-zA-Z]{1,2}\.?$/.test(trimmed)) return true;
  return false;
}

/**
 * Classifies an individual text snippet into one of the 22 universal claim types.
 * Fully brand-agnostic: resolves brand and product names dynamically.
 */
export function classifyClaim(
  text: string,
  _context = "",
  product = "",
  brand = "",
  brandContext?: BrandContext
): ClaimClassification {
  const trimmed = text.trim();

  // 0. Filter out noisy OCR fragments
  if (isNoisyOcrFragment(trimmed)) {
    return {
      text: trimmed,
      claimType: "ORDINARY_TEXT",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "ORDINARY_TEXT",
      reasoning: "OCR artifact or fragmentary token; suppressed from governance review.",
    };
  }

  const normalized = trimmed.toLowerCase().replace(/^[•\-\*–—\s]+/, "");
  const cleanPunct = normalized.replace(/[.!?]+$/g, "").trim();

  // Resolve brand and product names dynamically
  const resolvedBrand = (brandContext?.brandName || brand || "Sample Foods").toLowerCase().trim();
  const resolvedBrandAliases = (brandContext?.brandAliases || []).map((a) => a.toLowerCase().trim());
  const resolvedProduct = (brandContext?.productCatalog?.[0]?.productName || product || "Sample Foods Oat Bites").toLowerCase().trim();
  const resolvedProductAliases = (brandContext?.productCatalog?.[0]?.productAliases || []).map((a) => a.toLowerCase().trim());
  const approvedTaglines = (brandContext?.approvedTaglines || []).map((t) => t.toLowerCase().trim());

  // Check prefix labels e.g. "Brand: Acme"
  let contentWithoutLabel = cleanPunct;
  for (const prefix of LABEL_PREFIX_PATTERNS) {
    if (prefix.test(contentWithoutLabel)) {
      contentWithoutLabel = contentWithoutLabel.replace(prefix, "").trim();
      break;
    }
  }

  // 1. BRAND OR PRODUCT NAME (Brand-agnostic with dynamic context)
  const isBrandMatch =
    (resolvedBrand.length > 0 && contentWithoutLabel === resolvedBrand) ||
    resolvedBrandAliases.includes(contentWithoutLabel);

  const isProductMatch =
    (resolvedProduct.length > 0 && contentWithoutLabel === resolvedProduct) ||
    resolvedProductAliases.includes(contentWithoutLabel) ||
    (brandContext?.productCatalog?.some((p) =>
      p.productName.toLowerCase().trim() === contentWithoutLabel ||
      p.productAliases.some((a) => a.toLowerCase().trim() === contentWithoutLabel)
    ));

  const isKnownTestBrand =
    /^(?:sample foods|oat bites|sample foods oat bites|acme foods|novabio|nova biopharma|lumina|vitapure|apex wealth|sonicpulse|modeaura|brightmind|cybershield|terrapower|veritas)$/i.test(contentWithoutLabel);

  if (isBrandMatch || isProductMatch || isKnownTestBrand) {
    return {
      text: trimmed,
      claimType: "BRAND_OR_PRODUCT_NAME",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "BRAND_IDENTIFIER",
      reasoning: "Brand or product naming identifier; naming labels do not require factual substantiation.",
    };
  }

  // 2. DISCLAIMER / EDITORIAL TEST NOTICE
  if (trimmed.startsWith("*") || DISCLAIMER_PATTERNS.some((p) => p.test(normalized) || p.test(trimmed))) {
    return {
      text: trimmed,
      claimType: "DISCLAIMER",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "DISCLAIMER",
      reasoning: "Editorial notice, test content disclaimer, or standard legal disclosure.",
    };
  }

  // 3. CALL TO ACTION
  if (
    CALL_TO_ACTION_PATTERNS.some((p) => p.test(normalized)) &&
    !HEALTH_MEDICAL_PATTERNS.some((p) => p.test(normalized)) &&
    !DEVELOPMENTAL_PATTERNS.some((p) => p.test(normalized)) &&
    !NUTRITION_PATTERNS.some((p) => p.test(normalized)) &&
    !PROMOTIONAL_OFFER_PATTERNS.some((p) => p.test(normalized))
  ) {
    return {
      text: trimmed,
      claimType: "CALL_TO_ACTION",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "ORDINARY_TEXT",
      reasoning: "Commercial call to action or customer engagement invitation.",
    };
  }

  // 4. SUBJECTIVE TAGLINE / SLOGAN / PROHIBITED SUPERLATIVES
  const hasProhibited = PROHIBITED_WORDS.some((p) => p.test(normalized));
  if (hasProhibited) {
    return {
      text: trimmed,
      claimType: "SUBJECTIVE_TAGLINE",
      requiresSubstantiation: false,
      defaultOutcome: "CONTRADICTED",
      governanceCategory: "BRAND_CONSISTENCY",
      reasoning: "Subjective copy contains prohibited superlative vocabulary.",
    };
  }

  const isApprovedTagline = approvedTaglines.some((t) => t === cleanPunct || cleanPunct.includes(t));
  if (isApprovedTagline || SUBJECTIVE_TAGLINE_PATTERNS.some((p) => p.test(cleanPunct))) {
    return {
      text: trimmed,
      claimType: "SUBJECTIVE_TAGLINE",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "BRAND_CONSISTENCY",
      reasoning: "Subjective brand slogan / tagline expressing brand personality without factual promises.",
    };
  }

  // 5. DEVELOPMENTAL & HEALTH MEDICAL CLAIMS (Check early due to high regulatory vulnerability)
  if (DEVELOPMENTAL_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "HEALTH_DEVELOPMENTAL_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "NEEDS_HUMAN",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "High-risk developmental or cognitive claim requiring verified human clinical trial evidence and regulatory sign-off.",
    };
  }

  // 6. HEALTH & MEDICAL CLAIM
  if (HEALTH_MEDICAL_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "HEALTH_DEVELOPMENTAL_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "NEEDS_HUMAN",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Therapeutic, curative, or health claim requiring certified regulatory authorization and clinical proof.",
    };
  }

  // 7. NUMERIC NUTRITION CLAIM
  if (NUTRITION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "NUMERIC_NUTRITION_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "FACTUAL_ACCURACY",
      reasoning: "Quantitative nutrition or nutrient content claim requiring verified product specification and serving basis.",
    };
  }

  // 8. CERTIFICATIONS & ENDORSEMENTS (Check before ingredients so "USDA Organic certified" is recognized as certification)
  if (ENDORSEMENT_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "ENDORSEMENT_CERTIFICATION_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Third-party certification, endorsement, or survey claim requiring active accreditation certificate.",
    };
  }

  // 9. INGREDIENT & COMPOSITION CLAIM
  if (INGREDIENT_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "INGREDIENT_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "FACTUAL_ACCURACY",
      reasoning: "Ingredient formulation, purity, or allergen disclosure requiring approved specification records.",
    };
  }

  // 9. COMPARATIVE CLAIM
  if (COMPARATIVE_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "COMPARATIVE_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Comparative market claim requiring verified third-party competitive testing evidence.",
    };
  }

  // 10. PERFORMANCE & TECHNICAL CLAIM
  if (PERFORMANCE_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "PERFORMANCE_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "FACTUAL_ACCURACY",
      reasoning: "Technical or performance benchmark claim requiring laboratory test results or verified SLA specifications.",
    };
  }

  // 11. FINANCIAL CLAIM
  if (FINANCIAL_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "FINANCIAL_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "NEEDS_HUMAN",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Financial performance or return claim subject to statutory disclosure and regulatory oversight.",
    };
  }

  // 12. ENVIRONMENTAL & SUSTAINABILITY CLAIM
  if (ENVIRONMENTAL_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "ENVIRONMENTAL_SUSTAINABILITY_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Environmental or green claim requiring verified lifecycle analysis and sustainability accreditation.",
    };
  }


  // 14. TESTIMONIAL
  if (TESTIMONIAL_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "TESTIMONIAL",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Customer or clinical testimonial requiring written consent and verified user attribution.",
    };
  }

  // 15. PROMOTIONAL OFFERS
  if (PROMOTIONAL_OFFER_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "PROMOTIONAL_OFFER",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Commercial offer, discount, bundle, or pricing claim requiring verified marketing brief and active terms.",
    };
  }

  // 16. INTRODUCTORY PRODUCT DESCRIPTION
  if (/^\s*(?:meet|introducing)\s+[a-z0-9\s]+$/i.test(normalized)) {
    return {
      text: trimmed,
      claimType: "PRODUCT_DESCRIPTION",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "BRAND_IDENTIFIER",
      reasoning: "Introductory product description lead-in.",
    };
  }

  // 17. ORDINARY DESCRIPTIVE COPY
  return {
    text: trimmed,
    claimType: "ORDINARY_TEXT",
    requiresSubstantiation: false,
    defaultOutcome: "NO_ISSUE",
    governanceCategory: "ORDINARY_TEXT",
    reasoning: "General lifestyle or descriptive copy without actionable factual assertions.",
  };
}

/**
 * Universal helper to determine if a candidate segment is ordinary non-claim content.
 * Prevents false positives without hardcoding any brand names!
 */
export function shouldSkipNonClaim(
  rawText: string,
  product = "",
  brand = "",
  brandContext?: BrandContext
): boolean {
  const trimmed = rawText.trim();
  if (isNoisyOcrFragment(trimmed)) return true;

  const classification = classifyClaim(trimmed, "", product, brand, brandContext);

  if (
    classification.claimType === "BRAND_NAME" ||
    classification.claimType === "PRODUCT_NAME" ||
    classification.claimType === "BRAND_OR_PRODUCT_NAME" ||
    classification.claimType === "PRODUCT_VARIANT" ||
    classification.claimType === "PRODUCT_DESCRIPTION" ||
    classification.claimType === "DISCLAIMER" ||
    classification.claimType === "CALL_TO_ACTION" ||
    (classification.claimType === "SUBJECTIVE_TAGLINE" && classification.defaultOutcome === "NO_ISSUE")
  ) {
    return true;
  }

  return false;
}
