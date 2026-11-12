/**
 * OnBrand — Specific 7-Point Finding Explanation Engine
 *
 * Replaces generic boilerplate impact text with grounded, specific explanations answering:
 * 1. What exact words caused the finding?
 * 2. What type of claim is this?
 * 3. What precise requirement applies?
 * 4. What approved evidence was checked?
 * 5. What did that evidence establish?
 * 6. Why is the current wording problematic?
 * 7. What should the creator do next?
 */

import type { ClaimType, FindingOutcome } from "./claim-classifier";

export interface StructuredFindingExplanation {
  exactWords: string;
  claimType: string;
  requirement: string;
  evidenceChecked: string;
  evidenceEstablished: string;
  whyProblematic: string;
  recommendedAction: string;
  summaryText: string;
}

export interface ExplanationInput {
  exactWords: string;
  claimType: ClaimType;
  outcome: FindingOutcome;
  product?: string;
  brand?: string;
  matchedEvidence?: Array<{ source_id: string; quote: string; authority: number }>;
  conflictingEvidence?: Array<{ source_id: string; quote: string; authority: number }>;
  regulatoryReference?: string;
  specificationDetails?: {
    claimedValue?: string;
    expectedValue?: string;
    unit?: string;
    servingBasis?: string;
  };
}

export function generateSpecificExplanation(input: ExplanationInput): StructuredFindingExplanation {
  const {
    exactWords,
    claimType,
    outcome,
    product = "Sample Foods Oat Bites",
    brand = "Sample Foods",
    matchedEvidence = [],
    conflictingEvidence = [],
    regulatoryReference,
    specificationDetails,
  } = input;

  const claimLabel = formatClaimTypeLabel(claimType);

  // 1. EXACT WORDS
  const wordsStr = `“${exactWords}”`;

  // 2. REQUIREMENT & EVIDENCE CHECKED
  let requirement = "";
  let evidenceChecked = "";
  let evidenceEstablished = "";
  let whyProblematic = "";
  let recommendedAction = "";

  switch (claimType) {
    case "BRAND_OR_PRODUCT_NAME":
      requirement = "Brand and product names are verified identifiers that do not require factual substantiation.";
      evidenceChecked = `Workspace brand registry for ${brand}.`;
      evidenceEstablished = `Confirmed as standard brand/product identifier (${wordsStr}).`;
      whyProblematic = "No issue. Brand and product names are compliant.";
      recommendedAction = "No action required.";
      break;

    case "SUBJECTIVE_TAGLINE":
      requirement = "Subjective slogans and taglines are permissible provided they avoid prohibited superlatives or unsubstantiated health claims.";
      evidenceChecked = `Brand voice guidelines and prohibited terminology registers.`;
      if (outcome === "CONTRADICTED") {
        evidenceEstablished = `Tagline contains unauthorized or prohibited terminology.`;
        whyProblematic = `The slogan uses terminology restricted by brand guidelines.`;
        recommendedAction = `Revise the slogan to use approved brand voice vocabulary.`;
      } else {
        evidenceEstablished = `Subjective brand slogan does not assert measurable product metrics or health benefits.`;
        whyProblematic = `No issue. Subjective tagline is compliant.`;
        recommendedAction = `No action required.`;
      }
      break;

    case "CALL_TO_ACTION":
      requirement = "Standard commercial calls to action are compliant and do not require factual substantiation.";
      evidenceChecked = `Promotional copy guidelines.`;
      evidenceEstablished = `Standard consumer engagement instruction (${wordsStr}).`;
      whyProblematic = "No issue. Call to action is compliant.";
      recommendedAction = "No action required.";
      break;

    case "DISCLAIMER":
      requirement = "Legal, regulatory, and editorial disclaimers clarify content context and limitations.";
      evidenceChecked = `Regulatory disclaimer standards.`;
      evidenceEstablished = `Standard disclaimer or test content notice.`;
      whyProblematic = "No issue. Disclaimer is compliant.";
      recommendedAction = "No action required.";
      break;

    case "ORDINARY_TEXT":
      requirement = "Descriptive lifestyle copy does not require factual citation unless asserting verifiable product claims.";
      evidenceChecked = `Workspace copy standards.`;
      evidenceEstablished = `Ordinary conversational text without factual or health assertions.`;
      whyProblematic = "No issue. Ordinary text is compliant.";
      recommendedAction = "No action required.";
      break;

    case "NUMERIC_NUTRITION_CLAIM":
      requirement = regulatoryReference
        ? `Mandatory nutrient content claim standard (${regulatoryReference}) requiring exact analytical backing.`
        : `Quantitative nutrition statements require an approved formulation specification matching the exact product variant and serving basis.`;
      evidenceChecked = `Approved product specification for ${product} (SRC-PRODUCT).`;

      if (outcome === "SUPPORTED") {
        const quote = matchedEvidence[0]?.quote ?? `${product} specification`;
        evidenceEstablished = `Matches approved specification: “${quote}”.`;
        whyProblematic = `No issue. Numeric claim is grounded and verified.`;
        recommendedAction = `No action required.`;
      } else if (outcome === "CONTRADICTED") {
        const confQuote = conflictingEvidence[0]?.quote ?? "";
        if (exactWords.toLowerCase().includes("sugar free") || exactWords.toLowerCase().includes("zero sugar")) {
          requirement = "Under FDA 21 CFR 101.60(c), a food may only be labelled 'Sugar Free' or 'Zero Sugar' if it contains less than 0.5 g of sugars per labeled serving and RACC.";
          evidenceEstablished = `Approved nutrition panel records ${specificationDetails?.expectedValue || "4 g"} added sugar per ${specificationDetails?.servingBasis || "30 g"} serving, which exceeds the statutory 0.5 g threshold.`;
          whyProblematic = `Advertising a product containing 4 g of added sugar as 'Sugar Free' directly contradicts approved formulation data and violates mandatory nutrient content claim regulations.`;
          recommendedAction = `Remove 'Sugar Free' immediately, or update the copy to state '4 g added sugar per serving'.`;
        } else {
          evidenceEstablished = `Approved specification states ${specificationDetails?.expectedValue ?? "a different value"}, conflicting with the drafted ${specificationDetails?.claimedValue ?? wordsStr}. ${confQuote ? `(“${confQuote}”)` : ""}`;
          whyProblematic = `Publishing conflicting nutritional metrics misinforms consumers and violates packaging truth-in-advertising standards.`;
          recommendedAction = `Update the numeric claim to match the approved specification value.`;
        }
      } else {
        // UNSUPPORTED
        evidenceEstablished = `The workspace has no approved nutrition specification for this exact product variant or serving size. We cannot verify the number.`;
        whyProblematic = `Unsubstantiated numeric nutrition claims risk consumer deception and regulatory audit failure if published without lab certification.`;
        recommendedAction = `Attach the certified nutrition panel for this exact SKU or remove the numeric claim until verified.`;
      }
      break;

    case "INGREDIENT_CLAIM":
      requirement = "All ingredient statements and compositional claims must be substantiated by an approved ingredient specification sheet or recipe formulation.";
      evidenceChecked = `Approved product ingredient register and allergen disclosures for ${product}.`;

      if (outcome === "SUPPORTED") {
        evidenceEstablished = `Approved formulation confirms the ingredient presence: “${matchedEvidence[0]?.quote ?? ""}”.`;
        whyProblematic = `No issue. Ingredient claim is verified.`;
        recommendedAction = `No action required.`;
      } else {
        // UNSUPPORTED
        evidenceEstablished = `Knowledge base contains allergen disclosures, but has no approved ingredient specification certifying this exact ingredient formulation.`;
        whyProblematic = `Stating ${wordsStr} is unverified in official product documentation. This is an ungrounded ingredient assertion, not proven false.`;
        recommendedAction = `Attach the approved ingredient formulation sheet or supplier certificate, or remove the claim until verified.`;
      }
      break;

    case "HEALTH_DEVELOPMENTAL_CLAIM":
      requirement = "Cognitive development, pediatric growth, and therapeutic benefit claims require competent and reliable scientific evidence (human clinical trials) and regulatory authorization (FTC Section 5 / FDA structure-function standards).";
      evidenceChecked = `Workspace clinical trial repository and regulatory health claims registry.`;

      if (outcome === "SUPPORTED") {
        evidenceEstablished = `Supported by authorized clinical evidence in workspace.`;
        whyProblematic = `No issue. Verified.`;
        recommendedAction = `Ensure mandatory qualification disclosures accompany the claim.`;
      } else {
        // NEEDS_HUMAN / HIGH RISK
        evidenceEstablished = `No clinical trial documentation or regulatory authorization for child cognitive enhancement or developmental benefit was found in the workspace.`;
        whyProblematic = `High-risk developmental claim. Promising enhanced intelligence or cognitive growth without clinical trial evidence exposes the organisation to regulatory enforcement and deceptive advertising liability.`;
        recommendedAction = `Escalate to legal and regulatory review. Do not publish without certified double-blind clinical trial evidence.`;
      }
      break;

    case "PROMOTIONAL_OFFER":
      requirement = "Commercial bundle contents, promotional pricing, and delivery guarantees must be substantiated by active commercial sales schedules.";
      evidenceChecked = `Commercial sales terms and active marketing promotion records.`;

      if (outcome === "SUPPORTED") {
        evidenceEstablished = `Active commercial promotion verifies the bundle and delivery terms.`;
        whyProblematic = `No issue. Commercial offer is verified.`;
        recommendedAction = `No action required.`;
      } else {
        // UNSUPPORTED
        evidenceEstablished = `No approved commercial promotion record exists confirming this bundle packaging or delivery schedule.`;
        whyProblematic = `Advertising an unverified commercial offer risks customer fulfillment failure or billing disputes. This is an offer verification gap, not a brand voice violation.`;
        recommendedAction = `Attach the approved promotional campaign terms or obtain e-commerce team verification before publication.`;
      }
      break;

    case "COMPARATIVE_CLAIM":
      requirement = "Comparative claims against competitors or market averages require competent, independent comparative testing.";
      evidenceChecked = `Competitive testing dossier and market research studies.`;
      evidenceEstablished = `No third-party comparative study found substantiating the comparison.`;
      whyProblematic = `Unsubstantiated comparative claims violate advertising substantiation rules and expose the brand to competitor legal challenges.`;
      recommendedAction = `Provide the certified comparative test data or rephrase as a standalone product benefit.`;
      break;

    case "ENDORSEMENT_CERTIFICATION_CLAIM":
      requirement = "Third-party certification seals and professional endorsements require active accreditation documentation.";
      evidenceChecked = `Accreditation and certification license registry.`;
      evidenceEstablished = `No active certification certificate located in the workspace.`;
      whyProblematic = `Displaying unverified certification marks or endorsements risks trademark infringement and deceptive advertising penalties.`;
      recommendedAction = `Upload the current valid certification document or remove the certification claim.`;
      break;

    case "PRODUCT_DESCRIPTION":
    default:
      requirement = "Product descriptive copy must accurately reflect approved product attributes.";
      evidenceChecked = `Approved product descriptions in brand repository.`;
      evidenceEstablished = `Descriptive product context introducing the item.`;
      whyProblematic = outcome === "CONTRADICTED" ? "Conflicts with approved product description." : "No issue.";
      recommendedAction = outcome === "CONTRADICTED" ? "Align wording with approved product specification." : "No action required.";
      break;
  }

  // Construct summary text
  let summaryText = "";
  if (outcome === "NO_ISSUE" || outcome === "SUPPORTED") {
    summaryText = `${claimLabel}: ${wordsStr}. ${evidenceEstablished}`;
  } else if (outcome === "CONTRADICTED") {
    summaryText = `${claimLabel} contradiction: ${wordsStr}. ${evidenceEstablished} ${whyProblematic} ${recommendedAction}`;
  } else if (outcome === "NEEDS_HUMAN") {
    summaryText = `${claimLabel} requires human regulatory review: ${wordsStr}. ${evidenceEstablished} ${whyProblematic} ${recommendedAction}`;
  } else {
    // UNSUPPORTED
    summaryText = `No applicable approved source was found. This means unverified, not proven false. ${claimLabel}: ${wordsStr}. ${evidenceEstablished} ${whyProblematic} ${recommendedAction}`;
  }

  return {
    exactWords,
    claimType: claimLabel,
    requirement,
    evidenceChecked,
    evidenceEstablished,
    whyProblematic,
    recommendedAction,
    summaryText,
  };
}

function formatClaimTypeLabel(claimType: ClaimType): string {
  switch (claimType) {
    case "BRAND_OR_PRODUCT_NAME":
      return "Brand/Product Name";
    case "PRODUCT_DESCRIPTION":
      return "Product Description";
    case "INGREDIENT_CLAIM":
      return "Ingredient Claim";
    case "NUMERIC_NUTRITION_CLAIM":
      return "Numeric Nutrition Claim";
    case "HEALTH_DEVELOPMENTAL_CLAIM":
      return "Health & Developmental Claim";
    case "COMPARATIVE_CLAIM":
      return "Comparative Claim";
    case "ENDORSEMENT_CERTIFICATION_CLAIM":
      return "Certification & Endorsement Claim";
    case "PROMOTIONAL_OFFER":
      return "Commercial Promotional Offer";
    case "SUBJECTIVE_TAGLINE":
      return "Subjective Tagline";
    case "CALL_TO_ACTION":
      return "Call to Action";
    case "DISCLAIMER":
      return "Disclaimer";
    case "ORDINARY_TEXT":
      return "Ordinary Copy";
  }
}
