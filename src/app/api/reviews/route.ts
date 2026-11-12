import { NextResponse } from "next/server";
import { createDraft, initialDraft, reviewDraft, seedSources, sourceInjectionWarnings, sourceSnapshotHash, stableHash, type Draft, type Source } from "../../../lib/onbrand";
import { z } from "zod";
import { resolveTenantContext } from "../../../lib/server/auth";
import { getRepository } from "../../../lib/server/repository";
import { modelConfigured, modelDescriptor, runAgentPanel, verifySemanticEvidence } from "../../../lib/server/model";
import { checkAndIncrementModelQuota } from "../../../lib/server/model-limits";

const factSchema = z.object({ id: z.string().max(120), subject: z.string().max(240), attribute: z.string().max(160), value: z.string().max(500), unit: z.string().max(40).optional(), statement: z.string().max(800), sourceId: z.string().max(120) });
const sourceSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().min(1).max(240), kind: z.enum(["PRODUCT_FACT", "APPROVED_CLAIM", "GUIDELINE", "DISCLOSURE"]),
  authority: z.number().min(0).max(100), version: z.number().int().positive(), effectiveFrom: z.string().date(), effectiveTo: z.string().date().optional(), revokedAt: z.string().optional(),
  channels: z.array(z.string().max(40)).max(20), owner: z.string().max(160), approvalState: z.enum(["APPROVED", "PENDING_REVIEW", "REVOKED"]), ingestionWarnings: z.array(z.string().max(300)).max(20).optional(), facts: z.array(factSchema).max(1000),
});
const reviewRequest = z.object({
  draft: z.object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(200),
    content: z.string().max(20000),
    channel: z.enum(["social", "web", "email", "packaging"]),
    product: z.string().max(200),
    audience: z.string().max(200),
    publicationDate: z.string().date(),
    version: z.number().int().positive(),
    hash: z.string().min(1).max(64),
    extraction: z.object({
      method: z.literal("OCR"),
      quality: z.enum(["RELIABLE", "NEEDS_PROOFREAD", "UNREADABLE"]),
      confidence: z.number().min(0).max(100),
      rawTextHash: z.string().length(64),
      reviewedTextHash: z.string().length(64).optional(),
    }).optional(),
  }),
  sources: z.array(sourceSchema).max(100).optional().refine((sources) => !sources || sources.reduce((total, source) => total + source.facts.length, 0) <= 2500, "Too many facts in one review request."),
  includeDemoRules: z.boolean().optional(),
  useAdvisoryModel: z.boolean().optional(),
  visualChecks: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 3_000_000) return NextResponse.json({ error: "Review request is larger than the 3 MB limit." }, { status: 413 });
    const body = reviewRequest.parse(await request.json());
    const draft = body.draft as Draft;
    if (draft.extraction && draft.extraction.quality !== "RELIABLE") {
      const currentTextHash = stableHash(draft.content);
      const edited = currentTextHash !== draft.extraction.rawTextHash;
      const acknowledged = draft.extraction.reviewedTextHash === currentTextHash;
      if (!edited || !acknowledged) {
        return NextResponse.json({ error: "OCR text needs a manual correction and proofread confirmation before review." }, { status: 409 });
      }
    }
    const sources = body.sources as Source[] | undefined;
    // Never trust caller-supplied hashes: the server recomputes the content fingerprint.
    const safeDraft = createDraft(draft.content, { ...draft });
    // Demo fixtures belong only to the canonical demo workspace. An explicitly
    // empty source list for a customer workspace means there is no evidence.
    const isDemoWorkspace = draft.id === initialDraft.id;
    const submittedSources = sources ?? (isDemoWorkspace ? seedSources : []);
    const quarantinedSources = submittedSources.filter((source) => sourceInjectionWarnings(source).length > 0);
    const quarantinedIds = new Set(quarantinedSources.map((source) => source.id));
    // The API must not trust a browser-supplied APPROVED flag for instruction-bearing content.
    const approvedSources = submittedSources.filter((source) => source.approvalState === "APPROVED" && !source.revokedAt && !quarantinedIds.has(source.id));
    const review = reviewDraft({ draft: safeDraft, sources: approvedSources, includeDemoRules: isDemoWorkspace && (body.includeDemoRules ?? true) });
    for (const source of quarantinedSources) {
      review.findings.push({
        finding_id: `F-SOURCE-QUARANTINE-${stableHash(source.id).slice(0, 8)}`, review_id: review.id, draft_id: safeDraft.id,
        draft_version_id: `${safeDraft.id}-v${safeDraft.version}`, draft_hash: safeDraft.hash,
        claim_id: `SRC-${stableHash(source.id).slice(0, 8)}`, claim_text: `Knowledge source quarantined: ${source.title}`,
        start: 0, end: 0, category: "SOURCE_SECURITY", evidence_status: "NEEDS_HUMAN", severity: "REVIEW",
        blocking_for_review: true,
        explanation: "The submitted source contains instruction-like text. The API excluded it from this review's evidence set. A maintainer must inspect and correct or reject the source before use.",
        source_evidence: [], created_at: new Date().toISOString(),
      });
    }

    let finalReview = review;
    const ctx = await resolveTenantContext(request);
    const repo = getRepository();

    // Round 3: Hosted model activation when enabled by environment and requested
    const isHostedModelEnabled = process.env.ENABLE_HOSTED_MODEL === "true";
    let modelDisclosure = "Deterministic mode is active. No model call was made.";

    if (body.useAdvisoryModel && isHostedModelEnabled && modelConfigured()) {
      const quotaCheck = checkAndIncrementModelQuota(ctx.userId || ctx.organizationId);
      if (!quotaCheck.allowed) {
        finalReview.engineMode = "deterministic-preview";
        modelDisclosure = `Deterministic fallback active: ${quotaCheck.reason || "Quota limit reached"}.`;
      } else {
        try {
          const semanticResult = await verifySemanticEvidence(finalReview, safeDraft, approvedSources);
          finalReview = semanticResult.review;
          const agentNotes = await runAgentPanel(safeDraft, finalReview, approvedSources);
          if (agentNotes) {
            finalReview.agentNotes = [
              { agent: "Advocate", summary: agentNotes.advocate },
              { agent: "Challenger", summary: agentNotes.challenger },
              { agent: "Judge", summary: agentNotes.judge },
              { agent: "Policy & Risk", summary: agentNotes.policyRisk },
            ];
          }
          if (semanticResult.state === "needs-human") {
            finalReview.engineMode = "deterministic-preview";
            modelDisclosure = `Hosted verification could not reach consensus on ${semanticResult.unresolvedCount} claim(s); routed safely to NEEDS_HUMAN.`;
          } else if (semanticResult.candidateCount > 0 || agentNotes) {
            finalReview.engineMode = "model-assisted";
            modelDisclosure = `Hosted verification verified via ${modelDescriptor()}. Two-pass entailment and advisory panel complete.`;
          } else {
            finalReview.engineMode = "deterministic-preview";
            modelDisclosure = "Deterministic mode is active. All claims verified via deterministic rules.";
          }
        } catch {
          // Invariant 2: Failure degrades safely to deterministic fallback
          finalReview.engineMode = "deterministic-preview";
          modelDisclosure = "Hosted model call failed safely. Review evaluated under deterministic fallback rules.";
          for (const finding of finalReview.findings) {
            if (finding.category === "MESSAGE" && finding.evidence_status === "NEEDS_HUMAN") {
              finding.blocking_for_review = true;
            }
          }
        }
      }
    } else {
      finalReview.engineMode = "deterministic-preview";
    }

    finalReview.sourceSnapshotHash = sourceSnapshotHash(approvedSources);

    // Save review & audit trail to repository
    try {
      await repo.saveReview(ctx, finalReview);
      await repo.recordAuditEvent(ctx, {
        id: `AUDIT-REV-${stableHash(finalReview.id + Date.now()).slice(0, 16)}`,
        action: "REVIEW_COMPLETED",
        actorId: ctx.userId,
        organizationId: ctx.organizationId,
        entityType: "review",
        entityId: finalReview.id,
        metadata: {
          engineMode: finalReview.engineMode,
          findingsCount: finalReview.findings.length,
          hasBlocking: finalReview.findings.some((f) => f.blocking_for_review),
        },
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Repository logging must not break review return
    }

    return NextResponse.json({
      review: finalReview,
      engine: finalReview.engineMode,
      modelDisclosure,
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid review request." : "Review failed safely. Check the draft and try again.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
