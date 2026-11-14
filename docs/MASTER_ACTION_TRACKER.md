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
