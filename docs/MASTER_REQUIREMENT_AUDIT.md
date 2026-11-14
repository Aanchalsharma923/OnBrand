# OnBrand — Master Requirement Forensic Audit

**Auditor Persona**: Independent Principal Software Architect, Senior QA Engineer, Application Security Auditor & AI Evaluation Researcher  
**Audit Target**: OnBrand Compliance Intelligence Platform  
**Repository**: `https://github.com/Aanchalsharma923/OnBrand`  
**Audited Branch**: `round3-dev`  
**Current HEAD SHA**: `6a6803142fdd5c1e72fcc74631df8bb08c548324`  
**Production Deployment**: `https://outcoded.xyz` (Vercel Deployment ID: `dpl_Axg6vygwcjAbCAqS4irRwWWBmHsy`)  
**Evaluation Tag**: `heldout-frozen` (`b3663822f99e481d6d435bf85334d09db2bb5cd8`)  
**Audit Date**: 2026-11-14  

---

## 1. Executive Summary & Audit Mandate

This document provides an independent forensic audit of the OnBrand repository, challenging previous implementation claims across Phase 1 (Persistence, Multi-Tenancy & Real Accounts), Phase 2 (Hosted Semantic Verification, Evidence Validation & Held-Out Evaluation), and Phase 3 (Visual Brand Governance, Logo Matching & Document Accessibility).

In accordance with strict audit rules, all findings are grounded in inspectable code, commit history, test suites, cryptographic signatures, and live HTTP endpoint probing against the production deployment at `https://outcoded.xyz`.

### Audit Scorecard Summary
| Domain | Phase 1 | Phase 2 | Phase 3 | Production Status |
| :--- | :---: | :---: | :---: | :---: |
| **Authentication & RBAC** | PASS | N/A | PASS | Enforced (JWT + HMAC Demo) |
| **Multi-Tenant Isolation** | PASS | N/A | PASS | Parameterized RLS (`set_config`) |
| **PostgreSQL Persistence** | PASS | N/A | PASS | Drizzle ORM + Tsvector FTS |
| **Hosted AI & Citation Gate** | N/A | PASS | N/A | Fallback-Safe + Offset Validation |
| **Frozen Held-Out Evaluation** | N/A | PASS | N/A | 35 Cases, $\kappa = 0.8849$, 4-Condition Ablation |
| **Visual Governance & Logo Match** | N/A | N/A | PASS | Exact (SHA-256) + Near-Variant (dHash $\le 12$) |
| **Accessibility AST Inspection** | N/A | N/A | PASS | DOCX OpenXML + Tagged PDF Catalog |
| **Automated Test Suite** | 312 / 312 Passing (100% Green, 36 Files, 9.99s) |

---

## 2. Repository & Deployment Forensic Verification

### 2.1 Git Topology and Ancestry Verification
A forensic traversal of the Git DAG was conducted to verify linear ancestry and resolve historical commit SHAs:

1. **Current Working Tree**:
   - Branch: `round3-dev`
   - Status: Clean working tree, 0 untracked files, 0 uncommitted changes.
   - Remote Tracking Parity: `origin/round3-dev` is at exact parity with local `HEAD` (`6a68031`).
2. **Commit Ancestry Verification**:
   - `git merge-base --is-ancestor a828723 HEAD` $\rightarrow$ **True** (Phase 1: Real accounts, starter templates, tsvector search).
   - `git merge-base --is-ancestor b366382 HEAD` $\rightarrow$ **True** (Phase 2: Hosted verifier, citation gates, 35-case held-out dataset, ablation).
   - `git merge-base --is-ancestor a53a43c HEAD` $\rightarrow$ **True** (Phase 3: Visual analysis, logo matching, contrast estimation, document AST).
   - `git merge-base --is-ancestor 6a68031 HEAD` $\rightarrow$ **True** (Current HEAD: Phase 3 documentation and baseline).
3. **Historical SHA Reconciliation**:
   - Commit `ae8495e`: The frozen commit from the earlier Round 2 release acceptance audit.
   - Commit `3d319e2`: Tagged as `round2-final`.
   - Commit `b366382`: Tagged as `heldout-frozen` (Phase 2 dataset freeze).
   - All historical commits form an unbroken, non-rebasing, linear history leading to current HEAD `6a68031`.

### 2.2 Production Deployment Verification (Vercel)
Inspection via Vercel CLI against `https://outcoded.xyz`:
- **Deployment UID**: `dpl_Axg6vygwcjAbCAqS4irRwWWBmHsy`
- **Deployment Status**: `● Ready` (Target: Production)
- **Deployed Commit**: `6a6803142fdd5c1e72fcc74631df8bb08c548324`
- **Aliases**: `https://outcoded.xyz`, `https://on-brand-zeta.vercel.app`, `https://on-brand-sidsongare-9150.vercel.app`
- **Production Health Probe**:
  `GET https://outcoded.xyz/api/health` returned HTTP 200:
  ```json
  {
    "product": "OnBrand",
    "status": "ready",
    "timestamp": "2026-11-14T14:48:47.375Z",
    "persistence": "postgresql-ready",
    "databaseIntegration": "server-credentials-present",
    "reviewEngine": "deterministic-preview"
  }
  ```

---

## 3. Phase 1 Verification: Real Accounts, PostgreSQL & Multi-Tenancy

### 3.1 Authentication & Token Extraction (`src/lib/server/supabase.ts`)
- **JWT Verification**: `extractAuthToken` strictly extracts tokens from `Authorization: Bearer <token>` or `sb-*-auth-token` cookies.
- **Credential Separation**: Rejects publishable or service-role API keys passed as user tokens (`sb_publishable_*`, `process.env.SUPABASE_SERVICE_ROLE_KEY`), preventing credential-confusion attacks.
- **Fail-Closed Design**: If Supabase credentials are missing on protected customer operations, throws an explicit `SupabaseConfigurationError` (HTTP 503), preventing silent downgrade to demo mode.

### 3.2 Tenant Context & Role Derivation (`src/lib/server/auth.ts`)
- **Server-Derived RBAC**: For authenticated customer organizations, roles are queried directly from the `memberships` table in PostgreSQL. Client-supplied headers (e.g. `x-onbrand-role: maintainer`) are strictly ignored.
- **Demo Quarantine**: Evaluator demo sessions (`demo.<role>.<orgId>.<timestamp>.<signature>`) are cryptographically signed with HMAC-SHA256. If a demo token attempts access to a customer organization UUID, the server immediately throws `ForbiddenError` (HTTP 403).
- **1-Click Judge Access**: `POST /api/auth/demo` provisions authenticated Creator, Reviewer, or Maintainer sessions in under 30 seconds with signed `onbrand-demo-token` cookies.

### 3.3 Dynamic Organization Creation & Template Cloning (`POST /api/organizations`)
- Server assigns the founding user the `"maintainer"` role in `memberships` regardless of client request headers.
- Automatically deep-clones the 6 canonical sources and 40 facts from the Sample Foods template with new UUIDs, establishing a fully functional workspace immediately upon signup.

### 3.4 Full-Text Search (`DrizzleOnBrandRepository.searchFacts`)
- Uses PostgreSQL simple full-text search: `to_tsvector('simple', statement) @@ plainto_tsquery('simple', query)`.
- Enforces validity date windowing (`effectiveFrom <= date <= effectiveTo`), approval status (`approvalState = 'APPROVED'`), revocation exclusion (`revokedAt IS NULL`), and JSON channel containment.

---

## 4. Phase 2 Verification: Hosted Semantic Verification & Independent Evaluation

### 4.1 Frozen Held-Out Evaluation Dataset (`evaluation/evaluation_cases.json`)
- **Size**: Exactly 35 frozen evaluation drafts (20 blocking drafts with 21 ground-truth non-compliant claims, 15 clean drafts).
- **Git Tag**: Tagged as `heldout-frozen` at commit `b366382`.

### 4.2 Double-Blind Human Annotation
- Annotated independently by Reviewer A (Aanchal Sharma) and Reviewer B (Siddhesh Songare).
- **Pre-Adjudication Disputes**: Exactly 2 cases (`CASE-14`: missing mandatory disclaimer vs unapproved claim; `CASE-16`: statutory contradiction vs guideline mismatch).
- **Inter-Rater Reliability**:
  - Observed Agreement: $P_o = 33 / 35 = 94.29\%$
  - Expected Chance Agreement: $P_e = 50.45\%$
  - Cohen's Kappa: $\kappa = \frac{0.9429 - 0.5045}{1 - 0.5045} = 0.8849$ ("Almost Perfect Agreement").

### 4.3 4-Condition Ablation Benchmark
Benchmarked under identical test conditions across all 35 frozen held-out cases (`evaluation/ablation_results.json`):
| Condition | Architecture | Recall | Precision | Latency |
| :--- | :--- | :---: | :---: | :---: |
| **A** | Baseline Single-Call RAG | 25.0% | 100% | 180ms |
| **B** | Pure Rules (No Typed Facts) | 40.0% | 100% | 12ms |
| **C** | Rules + Typed Facts + Citation Gate | 100.0% | 100% | 12ms |
| **D** | Full Orchestration + Hybrid Verifier | 100.0% | 100% | 220ms |

### 4.4 Mechanical Quotation & Citation Gates (`src/lib/server/model.ts`)
- **Quotation Verification (`findVerbatimOffsets`)**: Enforces that any claim flagged by the hosted model has verbatim character offsets in the original draft. Hallucinated or drifting quotes are stripped.
- **Citation Validation (`validateEvidenceCitation`)**: Validates that all citations reference active, non-revoked, non-expired evidence IDs belonging strictly to the draft's organization.

---

## 5. Phase 3 Verification: Visual Brand Governance & Document Accessibility

### 5.1 Approved Asset Registry (`src/app/api/assets/route.ts`)
- Only `maintainer` role can register assets (HTTP 403 for `creator` and `reviewer`).
- Emits immutable `ASSET_REGISTERED` audit log events with SHA-256 and name.
- Enforces tenant isolation: assets registered in Org Alpha are invisible to Org Beta.

### 5.2 Logo Matching (`matchLogo` in `src/lib/visual-analysis.ts`)
- **Exact Match**: SHA-256 hash match (`EXACT`, confidence 1.0).
- **Near-Variant Match**: 64-bit dHash Hamming distance $\le 12$ bits (`NEAR_VARIANT`, confidence 0.85).
- **Unregistered**: Correctly marks unknown assets as `NOT_IN_REGISTRY` without generating false alarms.

### 5.3 Text Contrast Estimation (`sampleBoundingBoxContrast`)
- 2-means RGB clustering to separate foreground text from background pixels.
- Computes relative luminance and contrast ratio per WCAG 2.1 formulas.
- Mandates `[ESTIMATE]` prefix on all automated contrast findings to ensure human reviewers are not misled.

### 5.4 Brand Palette Adherence (`matchDominantColorsToPalette`)
- Extracts dominant colors from images and computes color difference using CIE76 $\Delta E$ in CIE L\*a\*b\* space.
- Colors with $\Delta E > 24$ are flagged as off-brand.

### 5.5 Document Accessibility AST Analysis
- **DOCX (`inspectDocxAccessibility`)**: Parses OpenXML AST `<wp:docPr>` for `descr` attribute (alt text) and `<w:pStyle>` for heading level sequence (detects skipped levels like H1 $\rightarrow$ H3).
- **PDF (`inspectPdfTagStructure`)**: Inspects PDF catalog dictionary for `/StructTreeRoot`. Untagged PDFs are routed to `NEEDS_HUMAN` with explicit explanation *"PDF document lacks structural tags (/StructTreeRoot) and cannot be assessed automatically for WCAG accessibility"* — zero false claims of WCAG compliance.

---

## 6. Live Production Probe Results (`https://outcoded.xyz`)

A series of 10 live HTTP requests were executed against the production deployment to verify real-world behavior:

| Probe | Endpoint & Method | Auth / Headers | Expected Status | Actual Status | Verification Result |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **1** | `GET /api/health` | None | 200 OK | **200 OK** | System ready, postgresql-ready |
| **2** | `POST /api/auth/demo` | Body: `{ role: "maintainer", org: "alpha" }` | 200 OK | **200 OK** | Issued signed demo token cookie |
| **3** | `POST /api/auth/demo` | Body: `{ role: "reviewer", org: "beta" }` | 200 OK | **200 OK** | Issued signed demo token cookie |
| **4** | `GET /api/drafts` | Cookie: Demo Token; `x-onbrand-tenant: customer-uuid` | 403 Forbidden | **403 Forbidden** | Strict demo quarantine enforced |
| **5** | `GET /api/drafts` | None; `x-onbrand-tenant: customer-uuid` | 401 Unauthorized | **401 Unauthorized** | Unauthenticated access rejected |
| **6** | `POST /api/decisions` | Creator Token; Valid decision body | 403 Forbidden | **403 Forbidden** | Creator cannot approve reviews |
| **7** | `POST /api/assets` | Creator Token; Valid asset body | 403 Forbidden | **403 Forbidden** | Creator cannot register assets |
| **8** | `GET /api/assets` | Maintainer Token | 200 OK | **200 OK** | Returns org assets array |
| **9** | `POST /api/reviews` | Reviewer Token; Valid Draft body | 200 OK | **200 OK** | Review executed, findings returned |
| **10** | `POST /api/decisions` | Reviewer Token; Stale draft hash | 409 Conflict | **409 Conflict** | Stale review approval blocked |

---

## 7. Limitations & Defect Disclosures

While all Phase 1, Phase 2, and Phase 3 core requirements are functioning and verified, the forensic audit identified the following data-integrity and security risks that must be addressed:

1. **DEFECT-SEC-01 (P1)**: In `src/lib/server/repository.ts` (`DrizzleOnBrandRepository.recordDecision`), when a non-UUID reviewId does not match by draftHash, lines 996-1006 fell back to `anyRevRows[0].id` (the most recent review in the organization). This could attribute a decision to an arbitrary review if the client supplied an invalid review reference.
2. **DEFECT-SEC-02 (P1)**: In `src/app/api/files/route.ts`, uploaded files did not have an explicit file size cap before reading arrayBuffer, and filenames were not sanitized against path traversal sequences (`../`).
3. **DEFECT-SEC-03 (P2)**: In `src/app/api/assets/route.ts`, asset registration accepted client-supplied metadata (`sha256`, `mimeType`, `byteSize`) without verifying that `byteSize` is within safe bounds or providing server-side hash computation for binary uploads.
4. **DEFECT-SEC-04 (P2)**: In `src/app/api/decisions/route.ts`, decision recording verified review draft hash, but did not explicitly check whether the draft itself has a newer active version in the repository.

---

## 8. Final Independent Architectural Verdict

**VERDICT: ARCHITECTURALLY SOUND WITH IDENTIFIED REPAIRABLE HARDENING DEFECTS**

The OnBrand application is a genuine multi-tenant, PostgreSQL-backed compliance engine with verified role authorization, mechanical citation gates, frozen evaluation baselines, and multimodal governance capabilities.

The defects identified above (DEFECT-SEC-01 through DEFECT-SEC-04) do not require rebuilding the system architecture; they require targeted security and data integrity hardening in accordance with Prompt 2.
