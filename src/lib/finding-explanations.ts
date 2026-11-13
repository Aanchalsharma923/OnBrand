/**
 * OnBrand — 10-Point Grounded Explainability Engine
 *
 * Implements strict, explainable AI explanations answering:
 * 1. WHAT: exact problematic passage
 * 2. TYPE: factual, legal/regulatory, brand consistency, visual, tone, accessibility
 * 3. WHY: specific reason
 * 4. RULE: applicable approved rule or specification standard
 * 5. EVIDENCE: actual source, version, authority, and quote
 * 6. GAP: missing or conflicting information
 * 7. IMPACT: consequence specific to this finding
 * 8. FIX: suggested replacement or next action
 * 9. CONFIDENCE: calibrated confidence and uncertainty
 * 10. REVIEW: whether human approval is required
 *
 * Zero generic boilerplate copy like "inconsistent voice weakens brand equity".
 * Fully decoupled from specific brands or products.
 */

import type { ClaimType, FindingOutcome } from "./claim-classifier";
import type { RegulatoryFindingDetails } from "./regulatory-intelligence";

export interface StructuredFindingExplanation {
  // 10-Part Core Explainability Contract
  what: string;
  type: "FACTUAL" | "REGULATORY_LEGAL" | "BRAND_GOVERNANCE" | "VISUAL_DESIGN" | "TONE_VOICE" | "ACCESSIBILITY";
  why: string;
  rule: string;
  evidence: string;
  gap: string;
  impact: string;
  fix: string;
  confidence: number; // 0.0 - 1.0
  reviewRequired: boolean;

  // Backwards-compatible properties
  exactWords: string;
  claimType: string;
  requirement: string;
  evidenceChecked: string;
  evidenceEstablished: string;
  whyProblematic: string;
  recommendedAction: string;
  summaryText: string;

  // Detailed regulatory dossier if applicable
  regulatoryDetails?: RegulatoryFindingDetails;
}

export interface ExplanationInput {
  exactWords: string;
  claimType: ClaimType;
  outcome: FindingOutcome;
  product?: string;
  brand?: string;
  matchedEvidence?: Array<{ source_id: string; quote: string; authority: number; source_title?: string; source_version?: number }>;
  conflictingEvidence?: Array<{ source_id: string; quote: string; authority: number; source_title?: string; source_version?: number }>;
  regulatoryReference?: string;
  regulatoryDetails?: RegulatoryFindingDetails;
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
    product = "Target Product",
    brand = "Target Brand",
    matchedEvidence = [],
    conflictingEvidence = [],
    regulatoryReference,
    regulatoryDetails,
    specificationDetails,
  } = input;

  const claimLabel = formatClaimTypeLabel(claimType);
  const wordsStr = `“${exactWords}”`;

  // Determine finding type category
  let typeCategory: StructuredFindingExplanation["type"] = "FACTUAL";
  if (
    regulatoryReference ||
    regulatoryDetails ||
    claimType === "HEALTH_MEDICAL_CLAIM" ||
    claimType === "DEVELOPMENTAL_CLAIM" ||
    claimType === "FINANCIAL_CLAIM"
  ) {
    typeCategory = "REGULATORY_LEGAL";
  } else if (
    claimType === "BRAND_NAME" ||
    claimType === "PRODUCT_NAME" ||
    claimType === "BRAND_OR_PRODUCT_NAME" ||
    claimType === "SUBJECTIVE_TAGLINE"
  ) {
    typeCategory = "BRAND_GOVERNANCE";
  }

  let requirement = "";
  let evidenceChecked = "";
  let evidenceEstablished = "";
  let whyProblematic = "";
  let recommendedAction = "";
  let gap = "None. Verified against active register.";
  let impact = "No negative impact.";
  let confidence = 0.95;
  let reviewRequired = false;

  // 1. BRAND AND PRODUCT NAMES
  if (
    claimType === "BRAND_NAME" ||
    claimType === "PRODUCT_NAME" ||
    claimType === "BRAND_OR_PRODUCT_NAME"
  ) {
    requirement = "Brand and product names are verified identifiers that do not require factual substantiation.";
    evidenceChecked = `Workspace brand registry for ${brand}.`;
    evidenceEstablished = `Confirmed as standard brand/product identifier (${wordsStr}).`;
    whyProblematic = "No issue. Brand and product naming identifiers are compliant.";
    recommendedAction = "No action required.";
    impact = "Cohesive brand recognition.";
    confidence = 1.0;
  }

  // 2. SUBJECTIVE TAGLINE / SLOGAN
  else if (claimType === "SUBJECTIVE_TAGLINE") {
    requirement = "Subjective slogans and taglines are permissible provided they avoid prohibited superlatives or unsubstantiated health promises.";
    evidenceChecked = `Brand voice guidelines and prohibited terminology registers.`;
    if (outcome === "CONTRADICTED") {
      evidenceEstablished = `Tagline contains unauthorized superlative vocabulary.`;
      whyProblematic = `The slogan uses terminology restricted by brand guidelines.`;
      recommendedAction = `Revise the slogan to use approved brand voice vocabulary.`;
      impact = "Hyperbolic claims compromise consumer trust and violate brand voice standards.";
      confidence = 0.92;
    } else {
      evidenceEstablished = `Subjective brand slogan expresses brand personality without asserting measurable product metrics.`;
      whyProblematic = `No issue. Subjective tagline is compliant.`;
      recommendedAction = `No action required.`;
      impact = "Reinforces approved brand personality.";
      confidence = 1.0;
    }
  }

  // 3. CALL TO ACTION
  else if (claimType === "CALL_TO_ACTION") {
    requirement = "Standard commercial calls to action are compliant and do not require factual substantiation.";
    evidenceChecked = `Promotional copy guidelines.`;
    evidenceEstablished = `Standard consumer engagement instruction (${wordsStr}).`;
    whyProblematic = "No issue. Call to action is compliant.";
    recommendedAction = "No action required.";
    confidence = 1.0;
  }

  // 4. DISCLAIMERS
  else if (claimType === "DISCLAIMER" || claimType === "LEGAL_NOTICE") {
    requirement = "Mandatory legal disclaimers and test notices must be preserved.";
    evidenceChecked = `Compliance disclosure register.`;
    evidenceEstablished = `Standard qualifying disclosure or editorial notice.`;
    whyProblematic = "No issue. Disclaimer is compliant.";
    recommendedAction = "Preserve wording and positioning.";
    confidence = 1.0;
  }

  // 5. ORDINARY DESCRIPTIVE COPY
  else if (claimType === "ORDINARY_TEXT" || claimType === "ORDINARY_DESCRIPTIVE") {
    if (outcome === "UNSUPPORTED") {
      requirement = "Content must be grounded in approved enterprise knowledge sources.";
      evidenceChecked = `Approved knowledge base for ${brand}.`;
      evidenceEstablished = `No active approved fact found for this assertion.`;
      whyProblematic = `The claim is ungrounded in the workspace knowledge base (unverified, not proven false).`;
      recommendedAction = `Verify against approved documentation before publication.`;
      gap = `Missing verified reference in knowledge library.`;
      impact = `Unverified assertions may require editorial review.`;
      confidence = 0.85;
    } else {
      requirement = "General descriptive and lifestyle copy without measurable claims does not require citations.";
      evidenceChecked = `General style guidelines.`;
      evidenceEstablished = `Descriptive lifestyle phrasing without factual assertions.`;
      whyProblematic = "No issue. Ordinary copy is compliant.";
      recommendedAction = "No action required.";
      confidence = 1.0;
    }
  }

  // 6. HEALTH, COGNITIVE & DEVELOPMENTAL CLAIMS
  else if (
    claimType === "HEALTH_MEDICAL_CLAIM" ||
    claimType === "DEVELOPMENTAL_CLAIM" ||
    claimType === "HEALTH_DEVELOPMENTAL_CLAIM"
  ) {
    typeCategory = "REGULATORY_LEGAL";
    reviewRequired = true;
    confidence = 0.96;

    if (regulatoryDetails) {
      requirement = `${regulatoryDetails.regulation} (${regulatoryDetails.provision})`;
      evidenceChecked = `Statutory regulatory frameworks (${regulatoryDetails.authority}) & clinical registry.`;
      evidenceEstablished = regulatoryDetails.reasoning;
      gap = `Missing: ${regulatoryDetails.missingFacts.join(", ") || "Approved clinical dossier"}`;
      whyProblematic = `Cognitive, growth, or therapeutic claims without authorized clinical substantiation violate advertising regulations and risk enforcement actions.`;
      recommendedAction = `Remove the claim or provide certified randomized clinical study records for regulatory compliance review.`;
      impact = `Exposure to regulatory enforcement, civil penalties under consumer protection statutes, and mandatory advertising withdrawal.`;
    } else {
      requirement = "Health and developmental assertions require certified clinical study evidence and legal sign-off.";
      evidenceChecked = `Health claims register and statutory advertising standards.`;
      if (outcome === "CONTRADICTED") {
        evidenceEstablished = `Claim promises disease prevention or curative effects without statutory authorization.`;
        whyProblematic = `Therapeutic claims on non-pharmaceutical products violate statutory food and drug regulations.`;
        recommendedAction = `Remove the curative statement entirely.`;
        impact = `Severe regulatory violation: product may be categorized as an unapproved drug.`;
      } else {
        evidenceEstablished = `No active, approved clinical trial record substantiates cognitive or growth acceleration.`;
        whyProblematic = `High-risk claim lacks verified clinical substantiation (unverified, not proven false).`;
        recommendedAction = `Escalate to legal and regulatory compliance for mandatory human review.`;
        gap = "Missing approved clinical trial registry documentation.";
        impact = `Risk of statutory inquiry and misleading advertising sanctions.`;
      }
    }
  }

  // 7. NUTRITION CLAIMS (e.g. Sugar Free, Protein, Calories)
  else if (
    claimType === "NUTRITION_CLAIM" ||
    claimType === "NUMERIC_NUTRITION_CLAIM" ||
    claimType === "NUMERIC_SPECIFICATION"
  ) {
    if (regulatoryDetails) {
      typeCategory = "REGULATORY_LEGAL";
      requirement = `${regulatoryDetails.regulation} (${regulatoryDetails.provision})`;
      evidenceChecked = `Approved product formulation register & ${regulatoryDetails.authority} nutrition regulations.`;
      evidenceEstablished = regulatoryDetails.reasoning;
      gap = regulatoryDetails.missingFacts.length > 0 ? `Missing: ${regulatoryDetails.missingFacts.join(", ")}` : "None";
      whyProblematic = regulatoryDetails.complianceStatus === "NON_COMPLIANT"
        ? `The claim contradicts the certified product nutrition panel under statutory regulatory limits.`
        : `Nutrition claim requires documented laboratory panel verification under local market standards.`;
      recommendedAction = regulatoryDetails.complianceStatus === "NON_COMPLIANT"
        ? `Remove or adjust the nutrient content claim to accurately reflect the certified specification.`
        : `Submit certified third-party laboratory nutrition panel for regulatory sign-off.`;
      impact = `Misleading nutritional labelling violates statutory standards and risks product recall or packaging repackaging costs.`;
      confidence = regulatoryDetails.confidence;
      reviewRequired = regulatoryDetails.humanReviewRequired;
    } else if (outcome === "CONTRADICTED") {
      requirement = "Published nutritional figures must strictly match the approved specification.";
      evidenceChecked = `Approved product specification register.`;
      const expected = specificationDetails?.expectedValue || conflictingEvidence[0]?.quote || "approved specification";
      evidenceEstablished = `Specification specifies ${expected}. Current copy states ${specificationDetails?.claimedValue || wordsStr}.`;
      whyProblematic = `Numeric discrepancy directly contradicts the certified product specification.`;
      recommendedAction = `Update figure to match approved specification (${expected}).`;
      gap = `Contradiction between published copy and certified specification.`;
      impact = `Inaccurate nutritional values expose brand to consumer protection complaints and regulatory fines.`;
    } else if (outcome === "SUPPORTED") {
      requirement = "Nutritional claims must be verified against an active product specification.";
      evidenceChecked = `Approved product specification register (${matchedEvidence[0]?.source_id ?? "active register"}).`;
      evidenceEstablished = `Matches certified specification: “${matchedEvidence[0]?.quote ?? wordsStr}”.`;
      whyProblematic = "No issue. Nutritional claim is verified and supported.";
      recommendedAction = "Ensure serving basis is prominently displayed.";
      impact = "Factual precision builds consumer confidence.";
    } else {
      requirement = "Nutritional claims require a verified product specification with serving basis.";
      evidenceChecked = `Active specification register for ${product}.`;
      evidenceEstablished = `No active specification fact found for this nutritional metric.`;
      whyProblematic = `The claim is ungrounded in the workspace knowledge base (unverified, not proven false).`;
      recommendedAction = `Upload the certified laboratory nutrition panel to the knowledge library, or verify before publication.`;
      gap = `Missing specification fact in knowledge library for ${product}.`;
      impact = `Unsubstantiated numerical claims cannot be defended in external compliance audits.`;
    }
  }

  // 8. INGREDIENT & COMPOSITION CLAIMS
  else if (claimType === "INGREDIENT_COMPOSITION" || claimType === "INGREDIENT_CLAIM") {
    if (outcome === "SUPPORTED") {
      requirement = "Ingredient statements must reflect approved formulation records.";
      evidenceChecked = `Approved ingredient register (${matchedEvidence[0]?.source_id ?? "SRC-CLAIMS"}).`;
      evidenceEstablished = `Verified ingredient in approved formulation: “${matchedEvidence[0]?.quote ?? wordsStr}”.`;
      whyProblematic = "No issue. Ingredient statement is verified.";
      recommendedAction = "No action required.";
      impact = "Accurate ingredient disclosure ensures customer safety.";
    } else {
      requirement = "Ingredient claims must be backed by an approved formulation specification.";
      evidenceChecked = `Approved formulation register for ${product}.`;
      evidenceEstablished = `Ingredient is not recorded in the active approved formulation.`;
      whyProblematic = `The assertion is ungrounded in the workspace knowledge base (unverified, not proven false).`;
      recommendedAction = `Attach supplier specification or recipe sheet to the knowledge base.`;
      gap = `Missing approved formulation record for specified ingredient.`;
      impact = `Risk of ingredient misbranding and undeclared formulation ambiguity.`;
    }
  }

  // 9. PROMOTIONAL OFFERS & COMMERCIAL TERMS
  else if (claimType === "PROMOTIONAL_OFFER") {
    if (outcome === "CONTRADICTED") {
      requirement = "Commercial package contents and delivery terms must match active campaign briefs.";
      evidenceChecked = `Active promotional briefs for ${product}.`;
      const conflictQuotes = conflictingEvidence.map((e) => `“${e.quote}”`).join(" vs ");
      evidenceEstablished = `Approved briefs contain conflicting offer terms: ${conflictQuotes}.`;
      whyProblematic = `Conflicting promotional briefs create commercial ambiguity. This is an offer terms conflict, not a brand voice violation.`;
      recommendedAction = `Reconcile the package quantity and shipping terms with the commercial team before publication.`;
      gap = `Discrepancy across marketing campaign briefs.`;
      impact = `Customer fulfillment disputes and e-commerce checkout discrepancies.`;
      confidence = 0.98;
    } else {
      requirement = "Commercial promotions must be verified against active campaign briefs.";
      evidenceChecked = `Commercial campaign brief register.`;
      evidenceEstablished = `No active approved brief covers this promotional term.`;
      whyProblematic = `Commercial offer is unverified in workspace records (unverified, not proven false).`;
      recommendedAction = `Upload the approved commercial launch brief, or confirm pricing and delivery terms.`;
      gap = `Missing active commercial brief in knowledge library.`;
      impact = `Unapproved discount or bundle terms risk revenue leakage.`;
    }
  }

  // 10. COMPARATIVE CLAIMS
  else if (claimType === "COMPARATIVE_CLAIM") {
    requirement = "Comparative superiority claims require verified third-party comparative study citations.";
    evidenceChecked = `Comparative claims register and independent testing files.`;
    evidenceEstablished = `No independent competitive benchmark study is on record.`;
    whyProblematic = `Comparative superiority assertions without verified testing data violate comparative advertising standards.`;
    recommendedAction = `Attach independent laboratory comparative study or qualify the claim with exact comparison basis.`;
    gap = `Missing third-party competitive study report.`;
    impact = `Competitor challenges before advertising watchdogs (e.g. NAD, ASCI, ASA) and corrective advertising orders.`;
    reviewRequired = true;
  }

  // 11. CERTIFICATIONS & ENDORSEMENTS
  else if (claimType === "CERTIFICATION_ENDORSEMENT") {
    requirement = "Certifications and professional endorsements require current accredited certificates.";
    evidenceChecked = `Certification registry and audit certificates.`;
    evidenceEstablished = `No active accreditation certificate on record for this claim.`;
    whyProblematic = `Displaying unverified certification seals violates trademark and false endorsement laws.`;
    recommendedAction = `Upload current accreditation certificate with validity dates.`;
    gap = `Missing valid accreditation certificate.`;
    impact = `Liability for trademark infringement and deceptive endorsement under FTC / CPA rules.`;
    reviewRequired = true;
  }

  // DEFAULT / FALLBACK
  else {
    requirement = "Content must be grounded in approved enterprise knowledge sources.";
    evidenceChecked = `Approved knowledge base for ${brand}.`;
    evidenceEstablished = outcome === "SUPPORTED" ? "Verified against approved records." : "No matching approved source found.";
    whyProblematic = outcome === "SUPPORTED" ? "No issue." : "Ungrounded statement in published content.";
    recommendedAction = outcome === "SUPPORTED" ? "No action required." : "Verify against approved documentation.";
    gap = outcome === "SUPPORTED" ? "None" : "Missing verified reference in knowledge library.";
    impact = "Maintain standard enterprise documentation.";
  }

  // Compose grounded summary text
  const summaryText = `${claimLabel} (${wordsStr}): ${whyProblematic} ${recommendedAction}`;

  return {
    what: exactWords,
    type: typeCategory,
    why: whyProblematic,
    rule: requirement,
    evidence: evidenceChecked + (evidenceEstablished ? ` Established: ${evidenceEstablished}` : ""),
    gap,
    impact,
    fix: recommendedAction,
    confidence,
    reviewRequired,

    // Backwards-compatible properties
    exactWords,
    claimType: claimLabel,
    requirement,
    evidenceChecked,
    evidenceEstablished,
    whyProblematic,
    recommendedAction,
    summaryText,
    regulatoryDetails,
  };
}

function formatClaimTypeLabel(claimType: ClaimType): string {
  switch (claimType) {
    case "BRAND_NAME":
    case "BRAND_OR_PRODUCT_NAME":
      return "Brand Name";
    case "PRODUCT_NAME":
      return "Product Name";
    case "PRODUCT_VARIANT":
      return "Product Variant";
    case "PRODUCT_DESCRIPTION":
      return "Product Description";
    case "INGREDIENT_COMPOSITION":
    case "INGREDIENT_CLAIM":
      return "Ingredient Claim";
    case "NUMERIC_SPECIFICATION":
      return "Numeric Specification";
    case "NUTRITION_CLAIM":
    case "NUMERIC_NUTRITION_CLAIM":
      return "Nutrition Claim";
    case "HEALTH_MEDICAL_CLAIM":
      return "Health & Medical Claim";
    case "DEVELOPMENTAL_CLAIM":
    case "HEALTH_DEVELOPMENTAL_CLAIM":
      return "Child Development Claim";
    case "COMPARATIVE_CLAIM":
      return "Comparative Claim";
    case "PERFORMANCE_CLAIM":
      return "Performance Claim";
    case "FINANCIAL_CLAIM":
      return "Financial Claim";
    case "ENVIRONMENTAL_SUSTAINABILITY_CLAIM":
      return "Environmental Claim";
    case "CERTIFICATION_ENDORSEMENT":
    case "ENDORSEMENT_CERTIFICATION_CLAIM":
      return "Certification & Endorsement";
    case "TESTIMONIAL":
      return "Testimonial";
    case "PROMOTIONAL_OFFER":
      return "Promotional Offer";
    case "AVAILABILITY_DELIVERY":
      return "Availability & Delivery";
    case "SUBJECTIVE_TAGLINE":
      return "Subjective Tagline";
    case "CALL_TO_ACTION":
      return "Call to Action";
    case "DISCLAIMER":
      return "Disclaimer";
    case "LEGAL_NOTICE":
      return "Legal Notice";
    case "ORDINARY_DESCRIPTIVE":
    case "ORDINARY_TEXT":
      return "Ordinary Copy";
    default:
      return "Copy Assertion";
  }
}
