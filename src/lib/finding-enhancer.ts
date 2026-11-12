/**
 * OnBrand — Intelligent Finding Enhancer & Consolidation Engine
 * Transforms raw engine findings into structured, evidence-grounded,
 * consolidated governance findings with progressive disclosure.
 */

import type { Finding, Source } from "./onbrand";

export type FindingClassification =
  | "CONFIRMED_VIOLATION"
  | "UNSUPPORTED_CLAIM"
  | "BRAND_INCONSISTENCY"
  | "NEEDS_HUMAN"
  | "INFORMATIONAL";

export type FindingSeverity = "Critical" | "High" | "Medium" | "Low";

export type FindingCategory =
  | "BRAND_CONSISTENCY"
  | "FACTUAL_ACCURACY"
  | "PROMOTIONAL_COMPLIANCE"
  | "VISUAL_IDENTITY"
  | "ACCESSIBILITY"
  | "SECURITY_CONFIDENTIALITY";

export interface FindingOccurrence {
  start: number;
  end: number;
  snippet: string;
  quote?: string;
  page?: number;
  paragraph?: number;
}

export interface EnrichedFinding {
  id: string;
  rawFindingId: string;
  finding_id: string;
  title: string;
  affectedText: string;
  claim_text: string;
  category: FindingCategory;
  classification: FindingClassification;
  severity: FindingSeverity;
  evidence_status: Finding["evidence_status"];
  confidence: number; // 0 - 100%
  explanation: string;
  whyItMatters: string;
  applicablePolicy: string;
  evidenceReference: string;
  suggestedCorrection?: string;
  suggestion?: string;
  suggestion_state?: Finding["suggestion_state"];
  occurrences: FindingOccurrence[];
  occurrenceCount: number;
  activeOccurrenceIndex: number;
  start: number;
  end: number;
  blocking: boolean;
  blocking_for_review: boolean;
  resolved: boolean;
  dismissed: boolean;
  dismissReason?: string;
  source_evidence: Finding["source_evidence"];
  sourceCitations: Array<{
    sourceId: string;
    sourceTitle: string;
    sourceVersion: number;
    quote: string;
    authority: number;
    relation?: string;
  }>;
}

/**
 * Maps legacy or engine categories to the 6 primary OnBrand governance categories.
 */
export function normalizeCategory(category: string, claimText: string, explanation: string): FindingCategory {
  const upper = category.toUpperCase();
  if (upper === "VISUAL" || upper.includes("COLOR") || upper.includes("PALETTE") || upper.includes("LOGO")) {
    return "VISUAL_IDENTITY";
  }
  if (upper === "ACCESSIBILITY" || upper.includes("A11Y") || upper.includes("CONTRAST")) {
    return "ACCESSIBILITY";
  }
  if (upper === "SOURCE_SECURITY" || upper.includes("SECURITY") || upper.includes("INJECTION")) {
    return "SECURITY_CONFIDENTIALITY";
  }
  if (
    explanation.toLowerCase().includes("fda") ||
    explanation.toLowerCase().includes("guarantee") ||
    explanation.toLowerCase().includes("clinical") ||
    explanation.toLowerCase().includes("trial") ||
    explanation.toLowerCase().includes("allergen") ||
    claimText.toLowerCase().includes("clinically") ||
    claimText.toLowerCase().includes("guarantee") ||
    claimText.toLowerCase().includes("guaranteed")
  ) {
    return "PROMOTIONAL_COMPLIANCE";
  }
  if (upper === "PRODUCT_FACT" || upper.includes("FACT") || explanation.toLowerCase().includes("protein") || explanation.toLowerCase().includes("sugar")) {
    return "FACTUAL_ACCURACY";
  }
  return "BRAND_CONSISTENCY";
}

/**
 * Maps evidence status to disciplined 4-state classification.
 * "Never automatically classify uncertainty as a confirmed violation."
 */
const PROMOTIONAL_SUPERLATIVE_PATTERNS = [
  /\b(best|#1|greatest|unmatched|revolutionary|miracle|guaranteed|cures|prevents|100%|clinical|proven|award-winning|leading)\b/i,
  /\b(health benefits?|cure|miraculous|breakthrough|risk-free)\b/i,
];

const BRAND_TONE_PATTERNS = [
  /\b(voice|tone|casual|formal|wording|style|typography|palette|color)\b/i,
];

export function classifyFinding(finding: Finding): {
  classification: FindingClassification;
  severity: FindingSeverity;
  confidence: number;
} {
  const status = finding.evidence_status;
  const isSecurity = finding.category === "SOURCE_SECURITY";
  const isVisual = finding.category === "VISUAL";
  const isA11y = finding.category === "ACCESSIBILITY";
  const text = (finding.claim_text || "").toLowerCase();
  const expl = (finding.explanation || "").toLowerCase();

  if (isSecurity) {
    return {
      classification: "CONFIRMED_VIOLATION",
      severity: "Critical",
      confidence: 96,
    };
  }

  // 1. Confirmed contradiction (evidence directly refutes claim)
  if (status === "CONTRADICTED" || status === "CONFLICT") {
    return {
      classification: "CONFIRMED_VIOLATION",
      severity: (finding.severity as string) === "CRITICAL" ? "Critical" : "High",
      confidence: 94,
    };
  }

  // 2. Needs approved evidence -> check if promotional/superlative claim vs brand inconsistency vs informational
  if (status === "NO_APPROVED_EVIDENCE") {
    const isPromotional = PROMOTIONAL_SUPERLATIVE_PATTERNS.some((p) => p.test(text) || p.test(expl));
    if (isPromotional || finding.category === "PROMOTIONAL_COMPLIANCE") {
      return {
        classification: "UNSUPPORTED_CLAIM",
        severity: finding.blocking_for_review ? "High" : "Medium",
        confidence: 88,
      };
    }

    const isToneStyle = BRAND_TONE_PATTERNS.some((p) => p.test(text) || p.test(expl)) || finding.category === "BRAND_CONSISTENCY";
    if (isToneStyle) {
      return {
        classification: "BRAND_INCONSISTENCY",
        severity: "Medium",
        confidence: 84,
      };
    }

    // Ordinary phrase or general statement without contradiction
    return {
      classification: "INFORMATIONAL",
      severity: "Low",
      confidence: 85,
    };
  }

  if (status === "PARTIALLY_SUPPORTED" || status === "NEEDS_HUMAN") {
    return {
      classification: "NEEDS_HUMAN",
      severity: isA11y || isVisual ? "Medium" : "Low",
      confidence: 82,
    };
  }

  return {
    classification: "INFORMATIONAL",
    severity: "Low",
    confidence: 92,
  };
}

/**
 * Derives a concise, professional title for the finding.
 */
export function deriveFindingTitle(finding: Finding, category: FindingCategory, classification: FindingClassification): string {
  const text = finding.claim_text.toLowerCase();
  const expl = finding.explanation.toLowerCase();

  if (category === "SECURITY_CONFIDENTIALITY") {
    return "Security: Quarantined Prompt Injection";
  }
  if (category === "ACCESSIBILITY") {
    if (expl.includes("contrast")) return "Accessibility: Insufficient Text Contrast";
    if (expl.includes("heading")) return "Accessibility: Non-Sequential Heading Hierarchy";
    if (expl.includes("alt")) return "Accessibility: Missing Visual Alternative Text";
    return "Accessibility: Document Structure Guideline";
  }
  if (category === "VISUAL_IDENTITY") {
    if (expl.includes("palette") || expl.includes("color")) return "Visual: Brand Palette Non-Conformance";
    if (expl.includes("logo")) return "Visual: Unapproved Logo Variant";
    return "Visual Identity Inconsistency";
  }
  if (category === "PROMOTIONAL_COMPLIANCE") {
    if (text.includes("clinical") || expl.includes("clinical")) return "Compliance: Unsupported Clinical Trial Claim";
    if (text.includes("guarantee") || text.includes("guaranteed")) return "Compliance: Unsubstantiated Performance Guarantee";
    if (expl.includes("allergen")) return "Compliance: Missing Required Allergen Warning";
    return "Compliance: Unsubstantiated Promotional Statement";
  }
  if (category === "FACTUAL_ACCURACY") {
    if (statusIsContradiction(finding)) return "Factual Discrepancy with Approved Specification";
    return "Factual Statement Requiring Approved Source";
  }
  if (text.includes("miracle") || text.includes("guilt-free")) return "Brand Voice: Prohibited Terminology";
  return classification === "CONFIRMED_VIOLATION"
    ? "Brand Guideline Conflict"
    : classification === "UNSUPPORTED_CLAIM"
    ? "Unverified Brand Assertion"
    : "Guideline Assessment Needed";
}

function statusIsContradiction(finding: Finding): boolean {
  return finding.evidence_status === "CONTRADICTED" || finding.evidence_status === "CONFLICT";
}

/**
 * Explains the real-world business, legal or operational risk.
 */
export function deriveWhyItMatters(category: FindingCategory, _classification?: FindingClassification, _text?: string): string {
  switch (category) {
    case "PROMOTIONAL_COMPLIANCE":
      return "Health, clinical, or performance claims without verified source backing can violate advertising standards (e.g. FDA/FTC), mislead consumers, and incur legal or reputational penalties.";
    case "FACTUAL_ACCURACY":
      return "Publishing conflicting or out-of-date product specifications erodes customer trust and causes operational confusion across sales, customer support, and packaging.";
    case "BRAND_CONSISTENCY":
      return "Inconsistent voice, unauthorised taglines, or prohibited terminology weakens market positioning and fragments corporate brand equity.";
    case "VISUAL_IDENTITY":
      return "Off-palette colors and inconsistent visual assets degrade brand recognition and violate published enterprise visual design tokens.";
    case "ACCESSIBILITY":
      return "Sub-threshold contrast or non-compliant document hierarchies prevent assistive technology users from accessing information and risk WCAG 2.1 AA compliance audits.";
    case "SECURITY_CONFIDENTIALITY":
      return "Unsanitized external instructions or confidential metadata within content could compromise downstream automated pipelines or inadvertently leak proprietary data.";
    default:
      return "Content published without complete guideline alignment increases brand ambiguity.";
  }
}

/**
 * Derives actionable guidance on what the creator or reviewer should do next.
 */
export function deriveNextAction(classification: FindingClassification, _category?: FindingCategory): string {
  switch (classification) {
    case "CONFIRMED_VIOLATION":
      return "Apply the suggested correction or rewrite the passage to conform with the cited approved source.";
    case "UNSUPPORTED_CLAIM":
      return "Add an approved study/document to the knowledge library, or remove the ungrounded assertion.";
    case "BRAND_INCONSISTENCY":
      return "Align wording and tone with approved brand voice guidelines and terminology.";
    case "NEEDS_HUMAN":
      return "Review the context with an authorised human reviewer before approving publication.";
    case "INFORMATIONAL":
      return "No change required. Content is aligned with approved brand memory.";
  }
}

/**
 * Consolidates duplicate findings across the document while preserving occurrences.
 */
export function consolidateFindings(
  findings: Finding[],
  fullContent: string,
  sources: Source[] = []
): EnrichedFinding[] {
  // Map of normalized key -> EnrichedFinding
  const grouped = new Map<string, EnrichedFinding>();

  for (const raw of findings) {
    const category = normalizeCategory(raw.category, raw.claim_text, raw.explanation);
    const { classification, severity, confidence } = classifyFinding(raw);
    const title = deriveFindingTitle(raw, category, classification);
    const whyItMatters = deriveWhyItMatters(category, classification, raw.claim_text);

    // Grouping key: issues with the exact same claim text and rule/category merge together
    const cleanClaim = raw.claim_text.trim().toLowerCase();
    const groupKey = `${category}::${cleanClaim}::${raw.evidence_status}`;

    const occurrence: FindingOccurrence = {
      start: raw.start,
      end: raw.end,
      snippet: raw.claim_text,
      quote: raw.claim_text,
    };

    if (grouped.has(groupKey)) {
      const existing = grouped.get(groupKey)!;
      // Append occurrence if not already present
      if (!existing.occurrences.some((occ) => occ.start === raw.start && occ.end === raw.end)) {
        existing.occurrences.push(occurrence);
        existing.occurrenceCount = existing.occurrences.length;
      }
    } else {
      const citations = (raw.source_evidence ?? []).map((ev) => {
        const src = sources.find((s) => s.id === ev.source_id);
        return {
          sourceId: ev.source_id,
          sourceTitle: src?.title ?? ev.source_id,
          sourceVersion: ev.source_version,
          quote: ev.quote,
          authority: ev.authority,
          relation: ev.citation_validation?.c5_relation,
        };
      });

      const evidenceRef = citations.length
        ? `${citations[0].sourceTitle} (v${citations[0].sourceVersion}, auth ${citations[0].authority})`
        : "No matching approved evidence found in workspace memory";

      const enriched: EnrichedFinding = {
        id: `EF-${raw.finding_id}`,
        rawFindingId: raw.finding_id,
        finding_id: raw.finding_id,
        title,
        affectedText: raw.claim_text,
        claim_text: raw.claim_text,
        category,
        classification,
        severity,
        evidence_status: raw.evidence_status,
        confidence,
        explanation: raw.explanation,
        whyItMatters,
        applicablePolicy: raw.category === "POLICY" ? "Enterprise Brand Guidelines" : "Knowledge Base Fact Register",
        evidenceReference: evidenceRef,
        suggestedCorrection: raw.suggestion,
        suggestion: raw.suggestion,
        suggestion_state: raw.suggestion_state,
        occurrences: [occurrence],
        occurrenceCount: 1,
        activeOccurrenceIndex: 0,
        start: raw.start,
        end: raw.end,
        blocking: raw.blocking_for_review,
        blocking_for_review: raw.blocking_for_review,
        resolved: false,
        dismissed: false,
        source_evidence: raw.source_evidence ?? [],
        sourceCitations: citations,
      };

      grouped.set(groupKey, enriched);
    }
  }

  // Also scan document content for any additional literal matches of the affected text
  // so all occurrences in the document are highlighted and navigable
  const result = Array.from(grouped.values());

  for (const item of result) {
    if (item.affectedText.length >= 6 && item.occurrences.length === 1) {
      let searchIdx = 0;
      const lowerDoc = fullContent.toLowerCase();
      const lowerSnippet = item.affectedText.toLowerCase();

      while (searchIdx < lowerDoc.length) {
        const found = lowerDoc.indexOf(lowerSnippet, searchIdx);
        if (found === -1) break;

        if (!item.occurrences.some((occ) => occ.start === found)) {
          const matchedText = fullContent.slice(found, found + item.affectedText.length);
          item.occurrences.push({
            start: found,
            end: found + item.affectedText.length,
            snippet: matchedText,
            quote: matchedText,
          });
        }
        searchIdx = found + lowerSnippet.length;
      }
    }
    item.occurrenceCount = item.occurrences.length;
  }

  return result;
}
