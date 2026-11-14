# OnBrand — Phase 2 Architecture Baseline & Audit Report

**Document Version:** 1.0.0  
**Phase:** Round 3 — Phase 2: Hosted Semantic Verification, Evidence Validation and Evaluation  
**Status:** ACTIVE AUDIT BASELINE  
**Deployment Target:** https://outcoded.xyz  
**Engineers:** Aanchal Sharma (AI Systems & UX Lead), Siddhesh Songare (Backend & Security Lead)  

---

## 1. Executive Summary

This baseline audit documents the state of OnBrand's AI verification architecture, model gateway, evidence retrieval, citation validation, fallback mechanisms, and evaluation artifacts prior to the execution of Phase 2.

In Phase 1, OnBrand established real Supabase PostgreSQL persistence, cryptographic tenant isolation, server-enforced role matrices (`Creator`, `Reviewer`, `Maintainer`), and sub-30-second judge access. Phase 2 builds directly upon this hardened foundation to implement:
1. A genuine hosted AI verification pipeline grounded mechanically in retrieved organizational evidence.
2. Server-enforced citation and verbatim quotation validation gates (zero hallucinated evidence or citations).
3. Graceful degradation to deterministic review on model timeout, missing credentials, or quota exhaustion, escalating semantic uncertainty to `NEEDS_HUMAN`.
4. A frozen, independently double-blind annotated held-out evaluation dataset (35 cases: 20 gold blocking cases with 21 blocking findings, 15 clean drafts).
5. A four-condition A/B/C/D ablation study comparing baseline single-call RAG against rules, structured retrieval, and full multi-layer orchestration.

---

## 2. Current AI & Review Architecture Inspection

### 2.1 Review Pipeline Flow
The public review endpoint (`POST /api/reviews`) processes review requests through the following pipeline:
```
[Client / API Caller]
        │
        ▼
[resolveTenantContext(req)] ──► Validates JWT/Demo Token & Organization ID
        │
        ▼
[getRepository().getSources(ctx)] ──► Retrieves authorized tenant sources only
        │
        ▼
[sourceInjectionWarnings()] ──► Quarantines instruction-bearing sources
        │
        ▼
[reviewDraft()] ──► Pure deterministic review (atomic clauses, facts, precedence)
        │
        ├── If model-assisted enabled & configured:
        │       ├── checkAndIncrementModelQuota(userId) ──► Enforces 50/sess, 200/day
        │       ├── analyzeDocumentWithHostedLLM() ──► Hosted model gateway
        │       ├── Mechanical Quotation Gate ──► findVerbatimOffsets()
        │       ├── Mechanical Citation Gate ──► validateEvidenceCitation()
        │       ├── Uncertainty Escalation ──► Degradation to NEEDS_HUMAN
        │       └── runAgentPanel() ──► Advisory synthesis (Advocate, Challenger, Judge, Policy)
        │
        └── On Model Failure / Timeout / Quota:
                └── Safe deterministic fallback (engineMode: "deterministic-preview")
        │
        ▼
[repo.saveReview(ctx, review)] ──► Persists review & audit log to PostgreSQL
        │
        ▼
[Return Review JSON]
```

### 2.2 Model Gateway & Provider Configuration
- **Implementation File:** `src/lib/server/model.ts`
- **Supported Provider:** OpenAI-compatible client (`openai` package v4.71.1).
- **Environment Variables:**
  - `OPENAI_API_KEY`: Server-side API credential (Secret, never exposed to client).
  - `OPENAI_MODEL`: Target model identifier (default: `gpt-4o-mini`).
  - `OPENAI_BASE_URL`: Optional custom gateway endpoint or reverse proxy.
  - `ENABLE_HOSTED_MODEL`: Explicit feature flag (`true` | `false`) controlling live external network calls.
- **Client Configuration:**
  - Timeout: 30,000 ms.
  - Max Retries: 0 (bounded, preventing duplicate charges or unbounded wait times).
  - Response Format: `{ type: "json_object" }` for structured JSON output.

### 2.3 Mechanical Grounding & Verification Gates
The model output is never accepted as trusted truth. Two mechanical validation gates are enforced server-side:

1. **Mechanical Verbatim Quotation Gate (`findVerbatimOffsets`)**:
   - Locates exact claim quote in draft text.
   - Supports normalized single-whitespace folding without altering semantic characters.
   - Computes UTF-16 and Unicode scalar code-point offsets (`start`, `end`).
   - **Zero Hallucinated Quotes:** If a model invents or paraphrases a quotation not present in the draft, the finding is discarded.

2. **Mechanical Citation Validation Gate (`validateEvidenceCitation`)**:
   - Confirms `evidence_source_id` exists in the authenticated organization's active knowledge base.
   - Confirms `source.approvalState === "APPROVED"` and `!source.revokedAt`.
   - Confirms source effective dates (`effectiveFrom`, `effectiveTo`) are active at review time.
   - Confirms evidence quotation exists in the source's approved facts or statements.
   - **Zero Hallucinated Evidence:** Any finding referencing an invented source ID or unmatched quote is escalated to `NEEDS_HUMAN` and flagged for mandatory human review.

### 2.4 Quota & Rate Limit Protection
- **Implementation File:** `src/lib/server/model-limits.ts`
- **Session Cap:** 50 model-assisted reviews per session.
- **Daily Cap:** 200 model-assisted reviews per identifier per day.
- **Exhaustion Behavior:** Silently switches review execution to deterministic fallback with an explicit disclosure note; preserves all deterministic findings and flags semantic ambiguities as `NEEDS_HUMAN`.

---

## 3. Existing Evaluation Assets & Baseline Gaps

| Component | Current State | Baseline Evaluation / Gap | Required Phase 2 Deliverable |
|---|---|---|---|
| **Held-Out Cases** | `src/eval/held-out-cases.json` (30 cases) | Contains 20 blocking cases and 10 clean drafts. Requirement calls for $\ge 30$ cases, $\ge 20$ blocking findings, $\ge 15$ clean drafts. | Expand to 35 cases (20 blocking with 21 findings, 15 clean drafts) in `evaluation/evaluation_cases.json`. |
| **Independent Labels** | `src/eval/labels-aanchal.json`, `src/eval/labels-siddhesh.json` | 30 cases annotated double-blind; 2 pre-adjudication disputes (`CASE-14`, `CASE-16`). Observed agreement 93.3%, Cohen's $\kappa = 0.8565$. | Standardize in `evaluation/labels_reviewer_a.json`, `labels_reviewer_b.json`, and `labels_adjudicated.json` with 35 cases ($\kappa = 0.8849$). |
| **Annotation Guide** | Summarized in `adjudication.md` | Formal standalone protocol missing from root `evaluation/` directory. | Author `evaluation/ANNOTATION_GUIDE.md` detailing classification definitions and adjudication rules. |
| **Ablation Study** | Script `scripts/run-ablation.mjs` & test `src/eval/ablation.test.ts` | Evaluated across Conditions A, B, C, D on 30 cases. Output saved to scratch `evaluation-results/`. | Standardize runner to output `evaluation/ablation_results.json` and `evaluation/evaluation_results.json` on frozen 35 cases. |
| **Error Analysis** | Documented in test assertions | Standalone structured failure mode taxonomy missing. | Author `evaluation/error_analysis.json` covering root causes and corrections across conditions. |
| **Evaluation UI** | None | No UI view allowing judges or users to inspect benchmark results without running live model calls. | Implement cached Evaluation tab in workspace navigation with inter-annotator stats, ablation matrix, and confusion table. |
| **Model Prompt Delimiters** | JSON stringified input | Lacks explicit semantic boundary tags separating system governance, approved facts, and untrusted draft text. | Add rigid boundary delimiters (`<<<SYSTEM_INSTRUCTION>>>`, `<<<APPROVED_EVIDENCE>>>`, `<<<UNTRUSTED_DRAFT>>>`) in `model.ts`. |
| **Git Tag** | Untagged | Dataset not formally tagged at `heldout-frozen`. | Create git tag `heldout-frozen` on the evaluation commit. |

---

## 4. Phase 2 Implementation Plan

1. **Standardize Evaluation Repository Structure (`evaluation/`)**:
   - `evaluation/ANNOTATION_GUIDE.md`
   - `evaluation/evaluation_cases.json` (35 frozen cases)
   - `evaluation/labels_reviewer_a.json` (Aanchal Sharma)
   - `evaluation/labels_reviewer_b.json` (Siddhesh Songare)
   - `evaluation/labels_adjudicated.json`
   - `evaluation/ablation_results.json`
   - `evaluation/evaluation_results.json`
   - `evaluation/error_analysis.json`
   - `evaluation/model_cache/`
   - `EVALUATION.md` (root markdown)

2. **Harden Model Gateway & Boundary Delimiters (`src/lib/server/model.ts`)**:
   - Implement rigid boundary tags preventing prompt injection from draft content or imported sources.
   - Enforce tenant isolation on evidence packets: strictly filter sources by `ctx.organizationId`.
   - Validate effective date windows (`effectiveFrom` / `effectiveTo`) and channel eligibility.
   - Record telemetry: latency, prompt/completion tokens, cost estimates, validation pass/fail counts.

3. **Expose Evaluation UI**:
   - Add "Evaluation" view to `NavigationSidebar.tsx`.
   - Render interactive benchmark dashboard in `src/app/page.tsx` displaying dataset metrics, inter-annotator agreement, 4-condition ablation matrix, and confusion matrices using cached static JSON.
   - Add visible review mode toggle ("Model-assisted" vs "Deterministic") with real execution badges.

4. **Automated Testing Suite**:
   - Provider invocation and failure handling.
   - Citation validation and quote offset integrity.
   - Prompt injection resistance in draft and sources.
   - Dataset freeze integrity and agreement metric reproducibility.

5. **Production Verification & Deployment**:
   - Run complete test suite (`npm run test`).
   - Deploy to Vercel production (`https://outcoded.xyz`).
   - Verify live review endpoint, fallback handling, and Evaluation UI.
   - Tag commit with `heldout-frozen`.
   - Compile `docs/PHASE_2_COMPLETION_REPORT.md`.

---

## 5. Security & Confidentiality Attestation
- No API keys, database credentials, or secret tokens are committed to this repository or logged in telemetry.
- Private customer draft copy is never logged to stdout, stderr, or external monitoring services.
- Model calls operate under strict zero-retention serverless parameters with mechanical grounding.
