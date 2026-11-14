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
