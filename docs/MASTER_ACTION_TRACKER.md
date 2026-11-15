# OnBrand — Master Action Tracker

**Target Branch**: `round3-dev`  
**Current Audit**: `6a6803142fdd5c1e72fcc74631df8bb08c548324`  
**Last Updated**: 2026-11-14  

---

## 1. Action Items Overview

| ID | Category | Task Description | Owner | Status | Verification Criteria |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **ACT-SEC-01** | Security / DB | Fix decision recording fallback in `repository.ts` | SecEng | **COMPLETED** | No arbitrary review fallback; throws when not found |
| **ACT-SEC-02** | Security / Storage | File upload size cap (50MB) & path traversal protection | SecEng | **COMPLETED** | `POST /api/files` rejects >50MB and cleans filename |
| **ACT-SEC-03** | Security / Storage | Asset schema hardening & bounds validation | SecEng | **COMPLETED** | `POST /api/assets` validates size, bounds, names |
| **ACT-SEC-04** | Security / Versioning | Version advance check in `POST /api/decisions` | SecEng | **COMPLETED** | HTTP 409 when newer draft version exists |
| **ACT-SEC-05** | Security / Tests | 14-point Adversarial Test Suite for Prompt 2 | QA/SecEng | **COMPLETED** | `security-hardening.test.ts` 14/14 passing (100%) |
| **ACT-SEC-06** | Documentation | Complete `docs/SECURITY_REPAIR_REPORT.md` | SecEng | **COMPLETED** | Comprehensive repair report published |
| **ACT-UX-01** | UX / Workflow | Verify 22-step customer journey with real data | FullStack | **COMPLETED** | E2E journey test passing with persisted DB |
| **ACT-UX-02** | UX / Onboarding | Onboarding explanations, roles & empty states | FullStack | **COMPLETED** | Clear role descriptions & sample data labels in UI |
| **ACT-UX-03** | UX / Tests | Browser & E2E workflow automation suite | QA | **COMPLETED** | `e2e-22step-journey.test.ts` exercising complete journey |
| **ACT-UX-04** | Documentation | Complete `docs/PRODUCT_WORKFLOW_ACCEPTANCE_REPORT.md` | ProductEng | **COMPLETED** | Complete acceptance report published |
| **ACT-AI-01** | AI / Deployment | Audit production Vercel LLM configuration | AI Systems | **COMPLETED** | Vercel env verified; fallback to deterministic preview confirmed |
| **ACT-AI-02** | AI / Benchmark | Independent reproduction of 35-case benchmark | Evaluation | **COMPLETED** | Kappa $\kappa=0.8849$ confirmed; condition C/D shortcut uncovered |
| **ACT-AI-03** | AI / Stress Set | Author 15-case realistic stress dataset | AI Systems | **COMPLETED** | `evaluation/stress_cases.json` covering 12 stress dimensions |
| **ACT-AI-04** | AI / Tests | 16-test AI reliability & gateway safety suite | QA / AI | **COMPLETED** | `ai-reliability-suite.test.ts` 16/16 passing (100%) |
| **ACT-AI-05** | AI / Tests | Stress benchmark evaluation suite | QA / AI | **COMPLETED** | `stress-benchmark.test.ts` 4/4 passing (100%) |
| **ACT-AI-06** | Documentation | Complete `docs/AI_RELIABILITY_ACCEPTANCE_REPORT.md` | AI Researcher | **COMPLETED** | Forensic AI acceptance report published |
| **ACT-VIS-01** | Visual / Asset Registry | Complete Asset Registry lifecycle & binary storage | SecEng / CV | **COMPLETED** | SHA-256 binary validation, 2D dHash, replacement & revocation |
| **ACT-VIS-02** | Visual / Logo Matching | Logo matching calibration & Round 1 95% gate enforcement | CV Eng | **COMPLETED** | Autonomous blocking disabled; experimental flags & `NEEDS_HUMAN` |
| **ACT-VIS-03** | Visual / OCR & Pipeline | OCR coordinate bounding boxes & proofread review gate | OCR / FullStack | **COMPLETED** | HTTP 409 review gate on low-confidence OCR; injection rejection |
| **ACT-VIS-04** | Visual / Color & Contrast | CIE76 Delta-E photo exemption & ambiguous perimeter check | CV / A11y | **COMPLETED** | Photo exemption prevents false blocks; border check escalates to `NEEDS_HUMAN` |
| **ACT-VIS-05** | Visual / Doc A11y | DOCX & PDF structural accessibility inspections | Doc / A11y | **COMPLETED** | True XML/tag inspection; untagged PDF `NEEDS_HUMAN` disclosure; no false WCAG claims |
| **ACT-VIS-06** | Visual / Audit & Docs | 12-test audit suite, 38 fixtures & acceptance report | QA / CV | **COMPLETED** | `visual-intelligence-audit.test.ts` 12/12 passing; `VISUAL_INTELLIGENCE_ACCEPTANCE_REPORT.md` |
| **ACT-AUD-01** | Live Audit / Workspace | DEF-WS-DROP-01: Connect form to server endpoint & session bootstrap | FullStack | **COMPLETED** | `POST /api/organizations` dispatched, persists brand voice/palette, switches org |
| **ACT-AUD-02** | Live Audit / Upload | DEF-UPLOAD-UI-01: Multipart file upload & fact ingestion in UI | FullStack / Storage | **COMPLETED** | `POST /api/assets` handles `multipart/form-data`, extracts PDF/DOCX/PNG to sources |
| **ACT-AUD-03** | Live Audit / Security | DEF-SEC-COOKIE-01: Demo cookie security flags (HttpOnly, Secure, Lax) | SecEng | **COMPLETED** | `onbrand-demo-token` cookie issued with `HttpOnly: true`, `Secure: true` on HTTPS |
| **ACT-AUD-04** | Live Audit / UX | DEF-NAV-ARROW-01: Interactive finding navigator stepping & shortcuts | FullStack / QA | **COMPLETED** | `‹` and `›` step findings cyclicly (1→2→3→2), updates dossier & highlights |
| **ACT-AUD-05** | Live Audit / Layout | DEF-RESP-MOB-01: Mobile layout & zero horizontal overflow at 375px/390px | FrontEnd / A11y | **COMPLETED** | 0px horizontal overflow verified in Chromium on iPhone SE/14 viewports |

---

## 2. Action Details & Implementation Summary

### ACT-SEC-01: Fix Decision Recording Fallback in Repository
- **Target File**: `src/lib/server/repository.ts`
- **Action**: In `DrizzleOnBrandRepository.recordDecision`, removed the insecure arbitrary review fallback (`anyRevRows[0].id`). If no review matches by UUID or draftHash within the tenant, an explicit error is thrown. In `InMemoryRepository.recordDecision`, review existence is strictly validated before recording.
- **Status**: **COMPLETED** (Verified by `security-hardening.test.ts` Vector 8).

### ACT-SEC-02: File Upload Size Cap & Path Traversal Protection
- **Target File**: `src/app/api/files/route.ts`
- **Action**: Enforced 50 MB hard payload limit (`MAX_FILE_SIZE = 50 * 1024 * 1024` -> HTTP 413). Sanitized filename paths via regex and base extraction, stripping `..` path traversals. Sanitized storage keys and added magic byte binary MIME type validation.
- **Status**: **COMPLETED** (Verified by `security-hardening.test.ts` Vectors 6 & 13).

### ACT-SEC-03: Asset Schema Hardening & Bounds Validation
- **Target File**: `src/app/api/assets/route.ts`
- **Action**: Added 50 MB cap on `byteSize` (`z.number().int().min(1).max(50 * 1024 * 1024)`). Sanitized asset names against path injection and enforced server-side SHA-256 verification when file content is provided.
- **Status**: **COMPLETED** (Verified by `security-hardening.test.ts` Vectors 7 & 14).

### ACT-SEC-04: Version Advance Check in Decision Recording
- **Target File**: `src/app/api/decisions/route.ts`
- **Action**: Added parent draft inspection. If the draft in the organization has advanced to a higher version or different content hash than what the review evaluated, `POST /api/decisions` rejects the approval with HTTP 409 Conflict.
- **Status**: **COMPLETED** (Verified by `security-hardening.test.ts` Vector 9).

### ACT-SEC-05: 14-Point Adversarial Test Suite
- **Target File**: `src/lib/server/security-hardening.test.ts`
- **Action**: Implemented comprehensive tests for all 14 adversarial vectors specified in Prompt 2 Section 8.
- **Status**: **COMPLETED** (14/14 tests passing, 100% green).

### ACT-SEC-06: Security Repair Report
- **Target File**: `docs/SECURITY_REPAIR_REPORT.md`
- **Action**: Authored exhaustive security repair report documenting defects, root causes, exact code changes, test suites, and verified security invariants.
- **Status**: **COMPLETED**.

### ACT-UX-01 & ACT-UX-03: Complete 22-Step Customer Journey Verification
- **Target File**: `src/lib/server/e2e-22step-journey.test.ts`
- **Action**: Implemented automated test covering all 22 steps of the customer journey: visitor arrival, account creation, email verification, sign-in, organization creation, starter template cloning, workspace entry, brand knowledge configuration, approved source and asset registration, draft authoring, review execution, findings inspection, offset verification, claim correction, re-review, binding human approval, and audit log persistence.
- **Status**: **COMPLETED** (17/17 test cases passing, 100% green).

### ACT-UX-02: Onboarding Explanations, Roles & Empty States
- **Target File**: `src/app/page.tsx`
- **Action**: Added explicit in-app guidance for Creator, Reviewer, and Maintainer roles, clear explanations for starter template data vs custom brand knowledge, and intuitive empty states.
- **Status**: **COMPLETED**.

### ACT-UX-04: Product Workflow Acceptance Report
- **Target File**: `docs/PRODUCT_WORKFLOW_ACCEPTANCE_REPORT.md`
- **Action**: Authored exhaustive product workflow acceptance report documenting customer journey execution, answers to the 6 core review questions, brand lifecycle, and production readiness.
- **Status**: **COMPLETED**.

### ACT-AI-01: Audit Production Vercel LLM Configuration
- **Target File**: Production deployment (`https://outcoded.xyz`) & Vercel project
- **Action**: Executed `npx vercel env ls` and tested `POST https://outcoded.xyz/api/reviews`. Confirmed `OPENAI_API_KEY` and `ENABLE_HOSTED_MODEL` are not configured in Vercel. Proved production cleanly degrades to `deterministic-preview` with disclosure `"Deterministic mode is active. No model call was made."` and `telemetry: null`, upholding the deterministic floor. Documented external admin action required in dashboard.
- **Status**: **COMPLETED**.

### ACT-AI-02: Independent Reproduction of 35-Case Benchmark
- **Target File**: `src/eval/reproduce-benchmark.test.ts`
- **Action**: Evaluated frozen held-out 35-case benchmark (`evaluation/evaluation_cases.json`). Confirmed inter-annotator agreement: Reviewer A & B agree on 33/35 cases, Cohen's Kappa $\kappa = 0.8849$, 95% CI $[0.7299, 1.0000]$. Discovered that prior reported 100% precision/recall was caused by `predictedBlocking = goldBlocking` shortcut in historical ablation scripts. Measured genuine unassisted deterministic baseline: TP: 12, FP: 10, TN: 5, FN: 8 (Precision: 54.5%, Recall: 60.0%, FPR: 66.7%).
- **Status**: **COMPLETED**.

### ACT-AI-03: 15-Case Realistic Stress Dataset
- **Target File**: `evaluation/stress_cases.json`
- **Action**: Authored a separate realistic 15-case stress benchmark covering all 12 specified stress dimensions: ambiguous claims, conflicting sources, long documents with buried claims, multi-claim sentences, paraphrased claims, explicit negation, unit conversions, expired evidence, wrong-channel evidence, prompt injection, unauthorized disease claims, and unclear product identity.
- **Status**: **COMPLETED**.

### ACT-AI-04: 16-Test AI Reliability & Gateway Safety Suite
- **Target File**: `src/eval/ai-reliability-suite.test.ts`
- **Action**: Implemented 16 automated tests covering: real provider invocation and Zod validation; retrieval grounding (`NO_APPROVED_EVIDENCE` vs `CONTRADICTED`, temporal date filtering, channel scoping, revoked sources); mechanical citation validation (fabricated IDs, fabricated quotes, verbatim Unicode offsets); deterministic floor preservation (model cannot suppress blocking findings or downgrade severity); and failure safety (missing key, 500 error escalation to `NEEDS_HUMAN`, malformed JSON, and quota caps).
- **Status**: **COMPLETED** (16/16 tests passing, 100% green).

### ACT-AI-05: Stress Benchmark Evaluation Suite
- **Target File**: `src/eval/stress-benchmark.test.ts`
- **Action**: Evaluated deterministic engine against the 15-case stress dataset: TP: 5, FP: 3, TN: 1, FN: 6 (Precision: 62.5%, Recall: 45.5%, FPR: 75.0%, Avg Latency: 10.34 ms). Documented exact error modes and safety boundaries.
- **Status**: **COMPLETED** (4/4 tests passing, 100% green).

### ACT-AI-06: AI Reliability Acceptance Report
- **Target File**: `docs/AI_RELIABILITY_ACCEPTANCE_REPORT.md`
- **Action**: Authored comprehensive forensic report documenting production invocation proof, evidence retrieval auditing, mechanical citation validation, deterministic floor invariants, gateway resilience, benchmark reproduction, stress analysis, explainability schemas, and latency/cost trade-offs.
- **Status**: **COMPLETED**.

### ACT-VIS-01: Complete Asset Registry Lifecycle & Binary Storage
- **Target Files**: `src/app/api/assets/route.ts`, `src/lib/server/repository.ts`, `src/lib/types.ts`
- **Action**: Enforced server-side binary validation against uploaded binary content, cryptographically calculating SHA-256 and computing 64-bit 2D dHash via Sharp. Built secure server binary storage (`serverAssetBinaryStore`) with binary retrieval endpoint (`GET /api/assets?id=xxx&binary=true`). Added `replacesAssetId` support in `POST /api/assets` to supersede older assets while preserving historic review findings, and added `PATCH /api/assets` for status updates (`APPROVED`, `REVOKED`) with complete audit trails.
- **Status**: **COMPLETED** (Verified by `visual-intelligence-audit.test.ts` Tests 1, 2, 3).

### ACT-VIS-02: Logo Matching Calibration & Round 1 95% Gate Enforcement
- **Target File**: `src/lib/visual-analysis.ts`
- **Action**: Calibrated 64-bit dHash matching algorithm. Demonstrated empirically that while exact binary matches achieve 0-bit Hamming distance, rotations $\ge 45^\circ$, cropping $> 30\%$, and embedded graphics degrade to 20-30 bit distance, failing the 95% precision gate for autonomous blocking. Disabled autonomous blocking for near-variant logos, flagged results with `isExperimental: true`, enforced neutral non-accusatory language (*"Asset not found in approved registry"*), and routed all near-matches and unregistered logos to `NEEDS_HUMAN` review.
- **Status**: **COMPLETED** (Verified by `visual-intelligence-audit.test.ts` Tests 4, 5).

### ACT-VIS-03: OCR Coordinate Bounding Boxes & Low-Confidence Proofread Gate
- **Target Files**: `src/lib/file-extraction.ts`, `src/app/api/reviews/route.ts`
- **Action**: Standardized OCR output on `[ymin, xmin, ymax, xmax]` normalized coordinates (0-1000 scale). Added strict low-confidence OCR review gate in `POST /api/reviews`: if OCR quality is `NEEDS_PROOFREAD` or `UNREADABLE`, review submission is blocked with HTTP 409 Conflict until the user manually edits and acknowledges the text via `reviewedTextHash`. Added prompt injection rejection to prevent printed text instructions from altering visual audit decisions.
- **Status**: **COMPLETED** (Verified by `visual-intelligence-audit.test.ts` Tests 6, 7).

### ACT-VIS-04: CIE76 Delta-E Lifestyle Photo Exemption & Ambiguous Perimeter Check
- **Target File**: `src/lib/visual-analysis.ts`
- **Action**: Enhanced palette compliance in `createPaletteFinding`: exempted lifestyle photography (`assetType: "PHOTOGRAPH"` or `isPhotography`) from blocking palette violations, emitting non-blocking informational advisories (`evidence_status: "SUPPORTED"`, `severity: "LOW"`). In `sampleBoundingBoxContrast`, added border perimeter distribution analysis: when border pixel counts between 2-means clusters differ by $< 15\%$, the sample is flagged `isAmbiguous: true` with reduced `perimeterConfidence`, escalating to `NEEDS_HUMAN` with clear `[ESTIMATE]` disclosure.
- **Status**: **COMPLETED** (Verified by `visual-intelligence-audit.test.ts` Tests 8, 9).

### ACT-VIS-05: Real DOCX & Tagged PDF Structural Accessibility Inspections
- **Target Files**: `src/lib/visual-analysis.ts`, `src/lib/file-extraction.ts`
- **Action**: Replaced filename heuristic inspection with genuine OpenXML DOM extraction in DOCX: inspects `word/document.xml` for missing alt text on drawings, flags generic single-word alt text (`"image"`, `"photo"`), exempts `<w14:decorative/>` shapes, detects skipped heading levels (e.g. H1 to H3), flags unheaded tables lacking `<w:tblHeader>`, and warns on ambiguous hyperlink text (*"click here"*). For PDFs, detects untagged documents lacking `/StructTreeRoot` and emits an honest `NEEDS_HUMAN` disclosure; inspects tagged PDFs for figure tags missing `/Alt` attributes without making false WCAG or PDF/UA certification claims.
- **Status**: **COMPLETED** (Verified by `visual-intelligence-audit.test.ts` Tests 10, 11).

### ACT-VIS-06: 12-Test Forensic Audit Suite, 38 Fixtures & Acceptance Report
- **Target Files**: `src/lib/server/visual-intelligence-audit.test.ts`, `evaluation/visual-fixtures/fixtures.json`, `docs/VISUAL_INTELLIGENCE_ACCEPTANCE_REPORT.md`
- **Action**: Created 38 ground-truth labelled fixtures covering all 4 visual and accessibility subsystems. Implemented comprehensive 12-test forensic audit suite verifying all Prompt 5 requirements (12/12 passing). Authored exhaustive 10-section acceptance report documenting algorithms, metrics, confusion matrices, failure modes, and production boundaries.
- **Status**: **COMPLETED** (12/12 tests passing, 100% green).

### ACT-AUD-01: Custom Workspace Creation & PostgreSQL Persistence (DEF-WS-DROP-01)
- **Target Files**: `src/app/page.tsx`, `src/app/api/organizations/route.ts`
- **Action**: Connected Welcome Modal workspace creation form to `POST /api/organizations`. Added session bootstrapping to ensure unauthenticated users receive a valid session token before org creation. Added error alerts and prevented premature modal dismissal. Updated state transitions to automatically switch active workspace and reload fresh brand profile server-side upon HTTP 200/201 response.
- **Status**: **COMPLETED** (Verified by `production-workflow-repair.test.ts` Section 4 and `visual-workflow.spec.ts` Browser 1).

### ACT-AUD-02: Multipart Knowledge Base Upload & Extraction (DEF-UPLOAD-UI-01)
- **Target Files**: `src/app/api/assets/route.ts`, `src/app/page.tsx`
- **Action**: Added native `multipart/form-data` handling to `POST /api/assets` supporting PDF, DOCX, and PNG binary uploads alongside JSON payloads. Integrated server-side SHA-256 hash generation, pHash image hashing, 50MB bounds checks, and storage upload. In `src/app/page.tsx`, wired file input to send binary `FormData` and chained asset registration with text extraction and `POST /api/sources` fact ingestion.
- **Status**: **COMPLETED** (Verified by `asset-multipart-upload.test.ts` 3/3 passing and `visual-workflow.spec.ts` Browser 2).

### ACT-AUD-03: Demo Cookie Security Flags (DEF-SEC-COOKIE-01)
- **Target File**: `src/app/api/auth/demo/route.ts`
- **Action**: Hardened `onbrand-demo-token` cookie configuration: set `httpOnly: true`, dynamically detect HTTPS (`x-forwarded-proto` or `NODE_ENV === "production"`) for `secure: true`, and maintained strict `sameSite: "lax"` protection.
- **Status**: **COMPLETED** (Verified by `production-workflow-repair.test.ts` Section 3).

### ACT-AUD-04: Finding Navigator Interactive Stepping & Shortcuts (DEF-NAV-ARROW-01)
- **Target Files**: `src/app/page.tsx`, `src/components/workspace/ReviewToolbar.tsx`
- **Action**: Fixed active finding resolution to properly handle `-1` initial index and normalize lookups across `id`, `finding_id`, and `rawFindingId`. Updated `runReview` to initialize selection to the first actionable finding (`actionableList[0]`) rather than informational findings. Added keyboard navigation (`ArrowLeft` / `ArrowRight`) to cycle active findings.
- **Status**: **COMPLETED** (Verified by `production-workflow-repair.test.ts` Section 6, `test-local-ui.mjs` stepping 1→2→3→2, and `visual-workflow.spec.ts` Browser 3).

### ACT-AUD-05: Mobile Responsive Layout & Zero Horizontal Overflow (DEF-RESP-MOB-01)
- **Target File**: `src/app/globals.css`
- **Action**: Added `@media (max-width: 680px)` breakpoint rules to wrap `.topbar` and `.topbar-right`, collapse the review workspace layout into a vertical stack, set `.right-intelligence-column` to `min-width: 0; width: 100%`, and enable horizontal scrolling on `.document-preview-container`.
- **Status**: **COMPLETED** (Verified by Playwright Chromium against `http://localhost:3009`: 0px horizontal scroll and 0px overflow at both 375px and 390px viewports).
