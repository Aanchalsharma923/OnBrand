/**
 * OnBrand — Claim-Type Classifier & Finding Outcomes
 *
 * Classifies extracted copy and document segments into 12 distinct claim types
 * and maps them to disciplined 6-state finding outcomes:
 *   SUPPORTED | CONTRADICTED | UNSUPPORTED | NEEDS_HUMAN | NO_ISSUE | NOT_APPLICABLE
 *
 * Prevents false positives by ensuring ordinary text, brand names, product names,
 * taglines, and calls to action are never flagged merely because they lack a citation.
 */

export type ClaimType =
  | "BRAND_OR_PRODUCT_NAME"
  | "PRODUCT_DESCRIPTION"
  | "INGREDIENT_CLAIM"
  | "NUMERIC_NUTRITION_CLAIM"
  | "HEALTH_DEVELOPMENTAL_CLAIM"
  | "COMPARATIVE_CLAIM"
  | "ENDORSEMENT_CERTIFICATION_CLAIM"
  | "PROMOTIONAL_OFFER"
  | "SUBJECTIVE_TAGLINE"
  | "CALL_TO_ACTION"
  | "DISCLAIMER"
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

// Common brand and product name tokens or patterns
const BRAND_OR_PRODUCT_PATTERNS = [
  /^(?:sample foods|oat bites|sample foods oat bites|acme foods|novabio|nova biopharma)$/i,
  /^(?:brand name|product name):/i,
];

// Call to action patterns - require an action verb at the start
const CALL_TO_ACTION_PATTERNS = [
  /^\s*(?:try|order|shop|buy|grab|get|visit|explore|discover|find|follow|join|learn more|subscribe|contact|taste)\b/i,
  /^\s*grab a (?:jar|pack|box|bite|snack)\b/i,
];

// Disclaimers / editorial notices
const DISCLAIMER_PATTERNS = [
  /^\s*(?:test content|disclaimer|notice|terms and conditions|terms apply|\*based on|\*results may vary|not evaluated by the fda|for demonstration purposes)\b/i,
  /claims are intentionally included for review/i,
  /copyright\s+(?:\d{4}|©)/i,
  /\b(?:subject to change|terms apply|prices and promotions|without notice)\b/i,
  /^\s*\*/,
];

// Subjective taglines and marketing slogans (no numbers, no ingredients, no specific health claims)
const SUBJECTIVE_TAGLINE_PATTERNS = [
  /^\s*(?:a little bite|a better (?:snack\s+)?break|a little bite[.,]?\s+a better snack break)[.!]*\s*$/i,
  /^\s*(?:snack happy|a better break|goodness in every (?:bite|crunch)|simple moments|snack your way|your everyday treat|naturally delicious|pure delight)[.!]*\s*$/i,
  /\b(?:a\s+[a-z]+\s+bite\s+for\s+your\s+health)\b/i,
];

// Numeric nutrition patterns (units + metrics)
const NUMERIC_NUTRITION_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*(?:g|grams?|mg|ml|kcal|calories)\s+(?:protein|added\s+sugar|sugar|sugars|fat|fiber|sodium|carbs|carbohydrates)\b/i,
  /\b\d+(?:\.\d+)?\s*(?:g|grams?|oz|ounces?|ml|bites?|pieces?)\s+serving\b/i,
  /\b(?:serving size|per serving):\s*\d+/i,
  /\b(?:sugar free|zero sugar|no sugar|sugar-free|fat free|zero fat|low fat|high protein)\b/i,
];

// Ingredient patterns
const INGREDIENT_PATTERNS = [
  /\b(?:made with|contains?|crafted with|real|wholegrain|whole grain|oats|cocoa|peanuts?|almonds?|wheat|dairy|soy|milk|gluten|non-gmo|organic)\b/i,
  /\b(?:no artificial|free from artificial|preservative-free)\b/i,
];

// Health and developmental claims (cognitive, growth, therapeutic, cure, prevent)
const HEALTH_DEVELOPMENTAL_PATTERNS = [
  /\b(?:helps? children grow smarter|grow smarter|boosts? brain|cognitive|cognitive performance|cognitive development|iq|intelligence|brain power|brain health)\b/i,
  /\b(?:cures?|prevents?|treats?|diagnose|remedy for|reduces? risk of disease|boosts? immune|immunity defense|heart disease|diabetes)\b/i,
  /\b(?:clinically proven|clinically tested|reverses aging|miracle cure)\b/i,
  /\b(?:improves? focus|improves? memory|improves? hydration|supports? concentration|supports? restful sleep)\b/i,
  /\b(?:meal replacement|cure diabetes|superfood)\b/i,
];

// Comparative claims
const COMPARATIVE_PATTERNS = [
  /\b(?:twice the|2x more|50% less|more than leading|better than|vs\. leading|#1 brand|preferred over|compared to)\b/i,
];

// Endorsement and certification claims
const ENDORSEMENT_PATTERNS = [
  /\b(?:usda organic|non-gmo project verified|certified gluten[- ]free|recommended by \d+ out of \d+|doctor recommended|pediatrician approved)\b/i,
];

// Promotional offer patterns
const PROMOTIONAL_OFFER_PATTERNS = [
  /\b(?:starter bundle|bundle includes|free shipping|standard delivery|buy \d+ get \d+|\$\d+(?:\.\d{2})?|limited time offer|money-back guarantee|money back guarantee|discount|save \d+%)\b/i,
  /\b(?:includes \d+ jars?|delivery included)\b/i,
];

// Prohibited / absolute superlatives that breach general brand voice rules
const PROHIBITED_WORDS = [
  /\b(?:miracle|revolutionary|magic|guaranteed results|100% cure)\b/i,
];

/**
 * Classifies an individual text snippet into one of the 12 claim types.
 */
export function classifyClaim(
  text: string,
  _context = "",
  product = "Sample Foods Oat Bites",
  brand = "Sample Foods"
): ClaimClassification {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase().replace(/^[•\-\*–—\s]+/, "");
  const cleanPunct = normalized.replace(/[.!?]+$/g, "").trim();

  // 1. BRAND OR PRODUCT NAME
  const normProduct = product.toLowerCase().trim();
  const normBrand = brand.toLowerCase().trim();
  const isExactBrand = cleanPunct === normBrand || cleanPunct === "sample foods" || cleanPunct === "novabio" || cleanPunct === "acme foods";
  const isExactProduct = cleanPunct === normProduct || cleanPunct === "oat bites" || cleanPunct === "sample foods oat bites";
  const matchesBrandOrProduct = isExactBrand || isExactProduct || BRAND_OR_PRODUCT_PATTERNS.some((p) => p.test(cleanPunct));

  if (matchesBrandOrProduct) {
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
  if (DISCLAIMER_PATTERNS.some((p) => p.test(normalized))) {
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
  // Make sure it doesn't contain a developmental, nutrition, or promotional offer claim
  if (
    CALL_TO_ACTION_PATTERNS.some((p) => p.test(normalized)) &&
    !HEALTH_DEVELOPMENTAL_PATTERNS.some((p) => p.test(normalized)) &&
    !NUMERIC_NUTRITION_PATTERNS.some((p) => p.test(normalized)) &&
    !PROMOTIONAL_OFFER_PATTERNS.some((p) => p.test(normalized))
  ) {
    return {
      text: trimmed,
      claimType: "CALL_TO_ACTION",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "ORDINARY_TEXT",
      reasoning: "Standard commercial call to action or customer engagement invitation.",
    };
  }

  // 4. SUBJECTIVE TAGLINE / SLOGAN
  if (SUBJECTIVE_TAGLINE_PATTERNS.some((p) => p.test(cleanPunct))) {
    const hasProhibited = PROHIBITED_WORDS.some((p) => p.test(cleanPunct));
    if (hasProhibited) {
      return {
        text: trimmed,
        claimType: "SUBJECTIVE_TAGLINE",
        requiresSubstantiation: false,
        defaultOutcome: "CONTRADICTED",
        governanceCategory: "BRAND_CONSISTENCY",
        reasoning: "Subjective tagline contains prohibited superlative vocabulary.",
      };
    }
    return {
      text: trimmed,
      claimType: "SUBJECTIVE_TAGLINE",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "BRAND_CONSISTENCY",
      reasoning: "Subjective brand slogan / tagline expressing brand personality without factual promises.",
    };
  }

  // 5. HEALTH & DEVELOPMENTAL CLAIM (Check early due to high regulatory risk!)
  if (HEALTH_DEVELOPMENTAL_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "HEALTH_DEVELOPMENTAL_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "NEEDS_HUMAN",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "High-risk developmental or health claim requiring certified human clinical trial evidence and regulatory sign-off.",
    };
  }

  // 6. NUMERIC NUTRITION CLAIM
  if (NUMERIC_NUTRITION_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "NUMERIC_NUTRITION_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "FACTUAL_ACCURACY",
      reasoning: "Quantitative nutrition or nutrient content claim requiring verified product specification and serving basis.",
    };
  }

  // 7. COMPARATIVE CLAIM
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

  // 8. ENDORSEMENT OR CERTIFICATION CLAIM
  if (ENDORSEMENT_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "ENDORSEMENT_CERTIFICATION_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Third-party certification or professional endorsement requiring valid accreditation documentation.",
    };
  }

  // 9. PROMOTIONAL OFFER / BUNDLE / PRICING
  if (PROMOTIONAL_OFFER_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "PROMOTIONAL_OFFER",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "PROMOTIONAL_COMPLIANCE",
      reasoning: "Commercial offer, package bundle, or pricing claim requiring active sales promotion records.",
    };
  }

  // 10. INGREDIENT CLAIM
  if (INGREDIENT_PATTERNS.some((p) => p.test(normalized))) {
    return {
      text: trimmed,
      claimType: "INGREDIENT_CLAIM",
      requiresSubstantiation: true,
      defaultOutcome: "UNSUPPORTED",
      governanceCategory: "FACTUAL_ACCURACY",
      reasoning: "Ingredient composition statement requiring verified formulation specification.",
    };
  }

  // 11. PRODUCT DESCRIPTION (Descriptive introductory lead-in without predicates)
  if (/^\s*(?:meet|introducing)\s+[a-z0-9\s]+$/i.test(normalized)) {
    return {
      text: trimmed,
      claimType: "PRODUCT_DESCRIPTION",
      requiresSubstantiation: false,
      defaultOutcome: "NO_ISSUE",
      governanceCategory: "BRAND_CONSISTENCY",
      reasoning: "General descriptive product copy introducing the item.",
    };
  }

  // 12. ORDINARY TEXT (Lifestyle copy, conversational lines)
  // e.g. "Grab a jar for your desk, your commute or your afternoon break."
  return {
    text: trimmed,
    claimType: "ORDINARY_TEXT",
    requiresSubstantiation: false,
    defaultOutcome: "NO_ISSUE",
    governanceCategory: "ORDINARY_TEXT",
    reasoning: "Ordinary conversational or lifestyle text; does not assert verifiable specifications or health claims.",
  };
}

/**
 * Checks whether an extracted text segment is ordinary non-claim copy that
 * should not enter factual evidence verification.
 */
export function shouldSkipNonClaim(raw: string, draftProduct = "Sample Foods Oat Bites"): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (/^\s*#ad\s*$/i.test(trimmed)) return true;

  const normalized = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const normProduct = draftProduct.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const withoutLeadIn = trimmed.replace(/^\s*(?:meet|introducing)\s+/i, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  // 1. Exact match with product or brand name
  if (normalized === normProduct || withoutLeadIn === normProduct) return true;
  if (normalized === "sample foods" || normalized === "oat bites" || normalized === "sample foods oat bites") return true;
  if (normalized === "novabio" || normalized === "nova biopharma" || normalized === "acme foods") return true;

  // 2. Classify claim type
  const classification = classifyClaim(trimmed, "", draftProduct);

  // If it's a standalone brand/product name
  if (classification.claimType === "BRAND_OR_PRODUCT_NAME") return true;

  // If it's a disclaimer / test content notice
  if (classification.claimType === "DISCLAIMER") return true;

  // If it's a call to action WITHOUT any health, nutrition, or ingredient claims
  if (classification.claimType === "CALL_TO_ACTION") return true;

  // If it's a subjective tagline WITHOUT prohibited words
  if (classification.claimType === "SUBJECTIVE_TAGLINE" && classification.defaultOutcome === "NO_ISSUE") return true;

  return false;
}

/**
 * Splits compound sentences and lines into atomic sub-claims with exact offsets.
 */
export function extractAtomicClaims(
  rawText: string,
  baseOffset = 0,
  product = "Sample Foods Oat Bites",
  brand = "Sample Foods"
): Array<{
  text: string;
  start: number;
  end: number;
  classification: ClaimClassification;
}> {
  const results: Array<{
    text: string;
    start: number;
    end: number;
    classification: ClaimClassification;
  }> = [];

  // Check for pipe or dash separated sub-claims
  if (rawText.includes("|") || rawText.includes("—") || rawText.includes(" - ")) {
    const delimiters = /(?:\s*\|\s*|\s*—\s*|\s+-\s+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = delimiters.exec(rawText)) !== null) {
      const segment = rawText.slice(lastIndex, match.index).trim();
      if (segment) {
        const segStart = baseOffset + rawText.indexOf(segment, lastIndex);
        const segEnd = segStart + segment.length;
        const cls = classifyClaim(segment, rawText, product, brand);
        results.push({
          text: segment,
          start: segStart,
          end: segEnd,
          classification: cls,
        });
      }
      lastIndex = match.index + match[0].length;
    }

    const trailing = rawText.slice(lastIndex).trim();
    if (trailing) {
      const segStart = baseOffset + rawText.indexOf(trailing, lastIndex);
      const segEnd = segStart + trailing.length;
      const cls = classifyClaim(trailing, rawText, product, brand);
      results.push({
        text: trailing,
        start: segStart,
        end: segEnd,
        classification: cls,
      });
    }

    return results;
  }

  // Single claim
  const trimmed = rawText.trim();
  const start = baseOffset + rawText.indexOf(trimmed);
  const end = start + trimmed.length;
  const cls = classifyClaim(trimmed, rawText, product, brand);
  return [{ text: trimmed, start, end, classification: cls }];
}
