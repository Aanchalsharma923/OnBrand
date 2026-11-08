import { NextResponse } from "next/server";
import { createDraft, reviewDraft, seedSources, sourceSnapshotHash, type Draft, type Source } from "@/lib/onbrand";
import { modelConfigured, runAgentPanel } from "@/lib/server/model";
import { z } from "zod";

const factSchema = z.object({ id: z.string().max(120), subject: z.string().max(240), attribute: z.string().max(160), value: z.string().max(500), unit: z.string().max(40).optional(), statement: z.string().max(800), sourceId: z.string().max(120) });
const sourceSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().min(1).max(240), kind: z.enum(["PRODUCT_FACT", "APPROVED_CLAIM", "GUIDELINE", "DISCLOSURE"]),
  authority: z.number().min(0).max(100), version: z.number().int().positive(), effectiveFrom: z.string().date(), effectiveTo: z.string().date().optional(), revokedAt: z.string().optional(),
  channels: z.array(z.string().max(40)).max(20), owner: z.string().max(160), approvalState: z.enum(["APPROVED", "PENDING_REVIEW", "REVOKED"]), facts: z.array(factSchema).max(1000),
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
  }),
  sources: z.array(sourceSchema).max(100).optional().refine((sources) => !sources || sources.reduce((total, source) => total + source.facts.length, 0) <= 2500, "Too many facts in one review request."),
});

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 3_000_000) return NextResponse.json({ error: "Review request is larger than the 3 MB limit." }, { status: 413 });
    const body = reviewRequest.parse(await request.json());
    const draft = body.draft as Draft;
    const sources = body.sources as Source[] | undefined;
    // Never trust caller-supplied hashes: the server recomputes the content fingerprint.
    const safeDraft = createDraft(draft.content, { ...draft });
    const approvedSources = (sources?.length ? sources : seedSources).filter((source) => source.approvalState === "APPROVED" && !source.revokedAt);
    const review = reviewDraft({ draft: safeDraft, sources: approvedSources });
    const panel = modelConfigured() ? await runAgentPanel(safeDraft, review, approvedSources) : null;
    if (panel) {
      review.agentNotes = [
        { agent: "Advocate", summary: panel.advocate },
        { agent: "Challenger", summary: panel.challenger },
        { agent: "Judge", summary: panel.judge },
        { agent: "Policy & Risk", summary: panel.policyRisk },
      ];
      review.engineMode = "model-assisted";
    } else {
      review.engineMode = "deterministic-preview";
      if (modelConfigured()) {
        review.findings.push({
          finding_id: "F-MODEL-UNAVAILABLE", review_id: review.id, draft_id: safeDraft.id, draft_version_id: `${safeDraft.id}-v${safeDraft.version}`,
          draft_hash: safeDraft.hash, claim_id: "C-MODEL", claim_text: "The advisory AI panel did not complete this review.", start: 0, end: 0,
          category: "SYSTEM", evidence_status: "NEEDS_HUMAN", severity: "REVIEW", blocking_for_review: true,
          explanation: "The model call failed or returned an invalid response. Retry the review or have an authorised person inspect every claim manually. Deterministic findings are retained, but this report cannot be approved as complete.", source_evidence: [], created_at: new Date().toISOString(),
        });
      }
    }
    review.sourceSnapshotHash = sourceSnapshotHash(approvedSources);
    return NextResponse.json({ review, engine: review.engineMode, modelDisclosure: panel ? "A model-assisted four-role panel supplied advisory notes. Code-generated statuses and citations remain authoritative." : modelConfigured() ? "The configured model failed. Review is marked needs-human; no automated pass is possible." : "No model key configured. This demo uses deterministic retrieval and policy checks; no model call was made." });
  } catch (error) {
    const message = error instanceof z.ZodError ? "Invalid review request." : "Review failed safely. Check the draft and try again.";
    return NextResponse.json({ error: message }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
