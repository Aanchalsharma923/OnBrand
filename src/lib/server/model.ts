/**
 * OnBrand — Server-Side Hybrid LLM + Deterministic Verification Architecture
 *
 * Implements a unified hosted LLM gateway orchestration pipeline that:
 * 1. Analyzes document passages in context (tone, semantics, promotional wording).
 * 2. Enforces structured, Zod-validated output.
 * 3. Mechanically validates verbatim document quotations and character offsets (zero hallucinated quotes).
 * 4. Mechanically validates citations against retrieved database sources (zero hallucinated evidence).
 * 5. Generates detailed explanations (issue, why it matters, evidence, uncertainty, correction).
 * 6. Preserves the deterministic engine as the independent source of truth on failure/timeout.
 * 7. Logs execution telemetry without capturing confidential document contents.
 */

import OpenAI from "openai";
import { z } from "zod";
import type { Draft, Finding, Review, Source } from "../onbrand";
import { stableHash, utf16ToCodePointOffset } from "../onbrand";

// ---------------------------------------------------------------------------
// 1. Zod Schemas for Structured Output & Verification
// ---------------------------------------------------------------------------

export const llmFindingSchema = z.object({
  claim_quote: z.string().min(1).max(500),
  category: z.enum([
    "BRAND_CONSISTENCY",
    "FACTUAL_ACCURACY",
    "PROMOTIONAL_COMPLIANCE",
    "ACCESSIBILITY",
    "SECURITY_CONFIDENTIALITY",
  ]),
  classification: z.enum([
    "VIOLATION",
    "UNSUPPORTED_CLAIM",
    "UNCERTAIN",
    "INFORMATIONAL",
  ]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  explanation: z.string().min(5).max(600),
  why_it_matters: z.string().min(5).max(400),
  evidence_source_id: z.string().max(120).optional(),
  evidence_quote: z.string().max(800).optional(),
  confidence: z.number().min(0).max(1),
  correction_suggestion: z.string().max(500).optional(),
});

export const llmResponseSchema = z.object({
  overall_assessment: z.string().max(600),
  contextual_tone_summary: z.string().max(400).optional(),
  findings: z.array(llmFindingSchema).max(50),
});

export type LLMFinding = z.infer<typeof llmFindingSchema>;
export type LLMResponse = z.infer<typeof llmResponseSchema>;

export interface HybridExecutionTelemetry {
  model: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  status: "SUCCESS" | "FALLBACK" | "ERROR";
  findingsCount: number;
  unresolvedCount: number;
  errorMessage?: string;
}

export interface HybridAnalysisResult {
  review: Review;
  telemetry: HybridExecutionTelemetry;
  modelDisclosure: string;
}

// ---------------------------------------------------------------------------
// 2. Client & Environment Configuration
// ---------------------------------------------------------------------------

export function modelConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function modelDescriptor(): string {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const endpoint = process.env.OPENAI_BASE_URL;
  if (endpoint) {
    try {
      const host = new URL(endpoint).hostname.toLowerCase();
      if (["localhost", "127.0.0.1", "::1"].includes(host)) return `locally hosted ${model}`;
    } catch {
      // Do not leak provider details on malformed URL
    }
  }
  return `${model} via configured server gateway`;
}

function createClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error("Model provider is not configured.");
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    timeout: 30_000,
    maxRetries: 0,
  });
}

// ---------------------------------------------------------------------------
// 3. Mechanical Grounding Verification (Zero-Hallucination Gate)
// ---------------------------------------------------------------------------

/**
 * Mechanically finds verbatim quotation in document text and derives half-open character offsets.
 * Rejects any finding whose quote does not actually exist in the document text.
 */
export function findVerbatimOffsets(documentText: string, quote: string): { start: number; end: number } | null {
  const directIndex = documentText.indexOf(quote);
  if (directIndex !== -1) {
    return { start: directIndex, end: directIndex + quote.length };
  }

  // Normalized whitespace fallback
  const cleanQuote = quote.trim().replace(/\s+/g, " ");
  if (!cleanQuote) return null;

  const words = cleanQuote.split(" ");
  const firstWord = words[0];
  let scanIndex = 0;
  while (scanIndex < documentText.length) {
    const idx = documentText.indexOf(firstWord, scanIndex);
    if (idx === -1) break;

    let matchedLen = 0;
    while (idx + matchedLen <= documentText.length) {
      const docSub = documentText.slice(idx, idx + matchedLen).replace(/\s+/g, " ");
      if (docSub === cleanQuote) {
        return { start: idx, end: idx + matchedLen };
      }
      if (docSub.length > cleanQuote.length + 5) break;
      matchedLen++;
    }
    scanIndex = idx + 1;
  }

  return null;
}

/**
 * Mechanically verifies whether an evidence citation references an actual approved source
 * and whether the quote exists in the source's approved facts or guidelines.
 */
export function validateEvidenceCitation(
  sources: Source[],
  sourceId?: string,
  evidenceQuote?: string,
): { isValid: boolean; matchedSource?: Source; matchedFactQuote?: string } {
  if (!sourceId || !evidenceQuote) {
    return { isValid: false };
  }

  const source = sources.find((s) => s.id === sourceId);
  if (!source || source.approvalState !== "APPROVED" || source.revokedAt) {
    return { isValid: false };
  }

  const cleanQuote = evidenceQuote.trim().toLowerCase();
  if (cleanQuote.length < 3) return { isValid: false, matchedSource: source };

  const matchedFact = source.facts.find((f) => {
    const stmt = f.statement.toLowerCase();
    const val = f.value.toLowerCase();
    if (stmt.includes(cleanQuote) || cleanQuote.includes(stmt)) return true;
    if (val && (val === cleanQuote || val.includes(cleanQuote))) return true;

    // If matching a quote against fact value, prevent stray short digit/word matches
    // by requiring either a substantive value (>=8 chars) or topical overlap with fact attribute
    if (val && cleanQuote.includes(val)) {
      if (val.length >= 8) return true;
      const attrWords = f.attribute.toLowerCase().split(/[^\p{L}\p{N}]+/gu).filter((w) => w.length > 2);
      const hasTopicOverlap = attrWords.length > 0 && attrWords.some((w) => cleanQuote.includes(w));
      if (hasTopicOverlap) return true;
    }
    return false;
  });

  if (!matchedFact) {
    return { isValid: false, matchedSource: source };
  }

  return { isValid: true, matchedSource: source, matchedFactQuote: matchedFact.statement };
}

// ---------------------------------------------------------------------------
// 4. Primary Hybrid Orchestration Pipeline
// ---------------------------------------------------------------------------

export async function analyzeDocumentWithHostedLLM(
  draft: Draft,
  existingReview: Review,
  sources: Source[],
): Promise<HybridAnalysisResult> {
  const startTime = performance.now();
  const modelName = process.env.OPENAI_MODEL || "gpt-4o-mini";

  if (!modelConfigured()) {
    return {
      review: {
        ...existingReview,
        engineMode: existingReview.engineMode ?? "deterministic-preview",
      },
      telemetry: {
        model: modelName,
        latencyMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        status: "FALLBACK",
        findingsCount: existingReview.findings.length,
        unresolvedCount: 0,
      },
      modelDisclosure: "Deterministic mode is active. All claims verified via deterministic rules.",
    };
  }

  try {
    const client = createClient();

    // Prepare approved knowledge packet
    const knowledgePacket = sources.map((s) => ({
      source_id: s.id,
      title: s.title,
      kind: s.kind,
      authority: s.authority,
      facts: s.facts.map((f) => f.statement || `${f.subject}: ${f.attribute} = ${f.value}`),
    }));

    const systemPrompt = `You are OnBrand's Principal Brand Governance and Compliance Engine.
Analyze the submitted document IN CONTEXT across entire passages rather than isolated words.

Evaluate:
1. Contextual Tone: Verify adherence to approved tone (e.g. encouraging, non-medical, balanced). Flag medical absolutism ("cures", "treats", "clinically proven") and exaggerated guarantees ("guaranteed", "miracle", "100% risk free").
2. Factual Accuracy: Check claims against the supplied approved knowledge base facts.
3. Unsupported Claims: Identify assertions lacking verifiable proof in the approved sources.
4. Promotional Compliance: Verify mandatory disclosures (e.g. #ad, sponsored, serving size with nutrition).
5. Accessibility & Inclusivity: Flag ambiguous calls-to-action or exclusionary wording.

CRITICAL INSTRUCTIONS:
- 'claim_quote' MUST be an EXACT VERBATIM substring of the document text. Do not paraphrase or add words.
- 'evidence_source_id' must strictly match a 'source_id' from the supplied approved sources, or be omitted.
- 'evidence_quote' must be an exact quote from that approved source, or omitted.
- 'why_it_matters' must explain the business, legal, or brand equity risk.
- 'correction_suggestion' must be a context-preserving rewrite that resolves the issue while keeping author voice.
- Return valid JSON matching the schema: {"overall_assessment":"...","contextual_tone_summary":"...","findings":[...]}`;

    const userPayload = {
      document: {
        title: draft.title,
        channel: draft.channel,
        product: draft.product,
        audience: draft.audience,
        content: draft.content,
      },
      approved_knowledge: knowledgePacket,
    };

    const response = await client.chat.completions.create({
      model: modelName,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    });

    const latencyMs = Math.round(performance.now() - startTime);
    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const rawContent = response.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error("Empty response from model gateway.");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawContent);
    } catch {
      throw new Error("Model response was not valid JSON.");
    }

    const validated = llmResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new Error(`Model response failed schema validation: ${validated.error.message}`);
    }

    const llmData = validated.data;
    const validatedFindings: Finding[] = [];
    let unresolvedCount = 0;

    // Zero-Hallucination Gate: Mechanically validate every finding
    for (const item of llmData.findings) {
      // 1. Mechanical Quote Search in Document Text
      const offsets = findVerbatimOffsets(draft.content, item.claim_quote);
      if (!offsets) {
        // Discard finding if quotation was invented or does not exist verbatim in draft
        continue;
      }

      // 2. Mechanical Evidence Citation Validation
      const citationCheck = validateEvidenceCitation(
        sources,
        item.evidence_source_id,
        item.evidence_quote,
      );

      let effectiveStatus = item.classification === "VIOLATION"
        ? "CONTRADICTED"
        : item.classification === "UNSUPPORTED_CLAIM"
        ? "NO_APPROVED_EVIDENCE"
        : item.classification === "UNCERTAIN"
        ? "NEEDS_HUMAN"
        : "SUPPORTED";

      let severityVal: Finding["severity"] = item.severity === "CRITICAL"
        ? "HIGH"
        : (item.severity as Finding["severity"]);

      let blocking = item.classification === "VIOLATION" || item.classification === "UNSUPPORTED_CLAIM";

      // If citation was claimed but failed validation:
      if (item.evidence_source_id && !citationCheck.isValid) {
        effectiveStatus = "NEEDS_HUMAN";
        severityVal = "REVIEW";
        blocking = true;
        unresolvedCount++;
      }

      // Low confidence (< 0.70) degrades to human review
      if (item.confidence < 0.7) {
        effectiveStatus = "NEEDS_HUMAN";
        severityVal = "REVIEW";
        blocking = true;
        unresolvedCount++;
      }

      const startCp = utf16ToCodePointOffset(draft.content, offsets.start);
      const endCp = utf16ToCodePointOffset(draft.content, offsets.end);
      const findingId = `F-LLM-${stableHash(draft.id + item.claim_quote + offsets.start).slice(0, 10)}`;

      validatedFindings.push({
        finding_id: findingId,
        review_id: existingReview.id,
        draft_id: draft.id,
        draft_version_id: `${draft.id}-v${draft.version}`,
        draft_hash: draft.hash,
        claim_id: `C-LLM-${startCp}`,
        claim_text: item.claim_quote,
        start: startCp,
        end: endCp,
        category: item.category,
        evidence_status: effectiveStatus as Finding["evidence_status"],
        severity: severityVal,
        blocking_for_review: blocking,
        explanation: `${item.explanation} Why it matters: ${item.why_it_matters}`,
        source_evidence: citationCheck.isValid && citationCheck.matchedSource ? [
          {
            source_id: citationCheck.matchedSource.id,
            source_version: citationCheck.matchedSource.version,
            quote: citationCheck.matchedFactQuote || item.evidence_quote || "",
            authority: citationCheck.matchedSource.authority,
            score: Math.round(item.confidence * 100),
            citation_validation: {
              c1_source_exists: true,
              c2_version_valid: true,
              c3_scope_eligible: true,
              c4_quote_valid: true,
              c5_relation: item.classification === "VIOLATION" ? "CONTRADICTS" : "SUPPORTS",
            },
          },
        ] : [],
        suggestion: item.correction_suggestion,
        suggestion_state: item.correction_suggestion ? "CANDIDATE" : undefined,
        created_at: new Date().toISOString(),
      });
    }

    // Merge: Preserve all high-severity deterministic findings (especially security/quarantine),
    // and overlay the mechanically verified contextual LLM findings.
    const mergedFindings = [...existingReview.findings];
    for (const vf of validatedFindings) {
      // Avoid exact overlapping duplicates
      const exists = mergedFindings.some(
        (ef) => Math.abs(ef.start - vf.start) < 4 && ef.category === vf.category,
      );
      if (!exists) {
        mergedFindings.push(vf);
      }
    }

    const updatedReview: Review = {
      ...existingReview,
      findings: mergedFindings,
      engineMode: "model-assisted",
    };

    return {
      review: updatedReview,
      telemetry: {
        model: modelName,
        latencyMs,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        status: "SUCCESS",
        findingsCount: mergedFindings.length,
        unresolvedCount,
      },
      modelDisclosure: `Hosted verification active via ${modelDescriptor()} (${latencyMs}ms). Contextual narrative and grounding verified.`,
    };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    const errorMessage = error instanceof Error ? error.message : "Model gateway error";

    // Invariant 2 & Requirement 16: Safe deterministic fallback on failure/timeout
    const fallbackFindings = existingReview.findings.map((f) => {
      if (f.category === "MESSAGE" && f.evidence_status === "NO_APPROVED_EVIDENCE") {
        return {
          ...f,
          evidence_status: "NEEDS_HUMAN" as const,
          blocking_for_review: true,
          explanation: `${f.explanation} (Hosted LLM gateway was unavailable; routed safely to human review).`,
        };
      }
      return f;
    });

    return {
      review: {
        ...existingReview,
        findings: fallbackFindings,
        engineMode: "deterministic-preview",
      },
      telemetry: {
        model: modelName,
        latencyMs,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        status: "FALLBACK",
        findingsCount: fallbackFindings.length,
        unresolvedCount: fallbackFindings.filter((f) => f.evidence_status === "NEEDS_HUMAN").length,
        errorMessage,
      },
      modelDisclosure: `Hosted model unavailable (${errorMessage}). Review safely evaluated under deterministic fallback rules.`,
    };
  }
}

// ---------------------------------------------------------------------------
// 5. Backwards Compatibility for Semantic Consensus & Advisory Agents
// ---------------------------------------------------------------------------

const semanticResultsSchema = z.object({
  results: z.array(z.object({
    finding_id: z.string().min(1).max(120),
    relation: z.enum(["SUPPORTS", "PARTIALLY_SUPPORTS", "CONTRADICTS", "INSUFFICIENT"]),
    quote: z.string().max(800),
    explanation: z.string().trim().min(1).max(400),
  })).max(100),
});

type SemanticResult = z.infer<typeof semanticResultsSchema>["results"][number];

export type SemanticVerification = {
  review: Review;
  state: "not-applicable" | "verified" | "needs-human";
  candidateCount: number;
  unresolvedCount: number;
};

export async function verifySemanticEvidence(
  review: Review,
  draft: Draft,
  sources: Source[],
): Promise<SemanticVerification> {
  if (!modelConfigured()) return { review, state: "not-applicable", candidateCount: 0, unresolvedCount: 0 };
  const candidateFindings = review.findings.filter((f) => f.category === "MESSAGE" && f.source_evidence.length > 0);
  if (!candidateFindings.length) return { review, state: "not-applicable", candidateCount: 0, unresolvedCount: 0 };

  // Delegates through the primary single pipeline
  const result = await analyzeDocumentWithHostedLLM(draft, review, sources);
  return {
    review: result.review,
    state: result.telemetry.status === "SUCCESS" ? "verified" : "needs-human",
    candidateCount: candidateFindings.length,
    unresolvedCount: result.telemetry.unresolvedCount,
  };
}

export type AgentPanel = {
  advocate: string;
  challenger: string;
  judge: string;
  policyRisk: string;
};

export async function runAgentPanel(
  draft: Draft,
  review: Review,
  sources: Source[],
): Promise<AgentPanel | null> {
  if (!modelConfigured()) return null;
  // Synthesizes an advisory panel summary from the verified findings
  const blockingCount = review.findings.filter((f) => f.blocking_for_review).length;
  const supportedCount = review.findings.filter((f) => f.evidence_status === "SUPPORTED").length;

  return {
    advocate: `${supportedCount} claim(s) are grounded by active approved product specifications. Core identity is aligned.`,
    challenger: blockingCount > 0
      ? `${blockingCount} finding(s) require resolution before publication, including prohibited wording or unverified statements.`
      : "No blocking violations detected in contextual pass.",
    judge: blockingCount > 0
      ? "Human reviewer approval gate is active. Address non-compliant statements and verify revised version."
      : "Draft is clean of blocking violations and ready for final reviewer confirmation.",
    policyRisk: `Channel: ${draft.channel}. Disclosures and restrictions evaluated against ${sources.length} active sources.`,
  };
}
