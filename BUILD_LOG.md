# OnBrand — Round 3 Engineering Build Log
**CodeTitans India 2026 — Final Round Submission**  
**Repository:** [github.com/Aanchalsharma923/OnBrand](https://github.com/Aanchalsharma923/OnBrand)  
**Live Production Deployment:** [outcoded.xyz](https://outcoded.xyz)  
**Engineering Team:** Siddhesh & Aanchal Sharma

---

## 1. Executive Summary & Delivery Scope

In Round 3, OnBrand transitioned from an inspectable browser-local prototype into an enterprise-grade, multi-tenant AI brand governance platform. The core pure review engine (`src/lib/onbrand.ts`) remained under strict freeze, with zero database, network, or external API imports.

Three major promised capabilities were delivered, verified, and deployed:
1. **Multi-Tenant Persistence, Authentication & RBAC**: Real Supabase PostgreSQL database integration via Drizzle ORM, Row-Level Security (`withOrganizationScope`), tenant context resolution (`resolveTenantContext`), role-based access control (`CREATOR`, `REVIEWER`, `MAINTAINER`), and automated tenant isolation test verification.
2. **Hosted Semantic Verification & Frozen Held-Out Benchmark**: Server-side hosted model gateway (`src/lib/server/model.ts`) with two-pass C5 entailment verification, strict Zod schema validation, quota caps (50 session / 200 daily), fail-safe fallback routing all errors/timeouts to `NEEDS_HUMAN`, double-blind labeled 30-case frozen held-out evaluation dataset with high inter-annotator agreement (Cohen's Kappa $\kappa = 0.8565$), and a formal 4-condition ablation benchmark.
3. **Visual Intelligence & AST Accessibility Engine**: Perceptual dHash and SHA-256 logo matching (`matchLogo`), WCAG relative luminance pixel contrast sampling with `[ESTIMATE]` disclosure, CIE76 Delta-E brand palette deviation analysis, and direct DOCX/PDF AST accessibility tree inspection.

---

## 2. Chronological Engineering Milestones

### Milestone 1: Foundation, Baseline Hygiene & Shared Contracts
- **Baseline Audit**: Ran complete regression suite on Round 2 baseline (49/49 tests passing).
- **Branching & Hygiene**: Created active working branch `round3-dev` and baseline Git tag `round2-final`.
- **Environment Matrix**: Configured `.env.example` with Supabase credentials, OpenAI model settings, and application URLs.
- **Contract Decoupling**: Authored `src/lib/types.ts` defining programmatic DTO contracts (`TenantContext`, `OnBrandRepository`, `ReviewDecision`, `AssetRecord`, `AuditEventRecord`).
- **Lint Gate Remediation**: Eliminated build-cache traversals in `eslint.config.mjs`, achieving 0 ESLint errors and 0 warnings.
- **Vitest Configuration**: Configured `vitest.config.ts` with 30s timeout and `@/` path alias.

### Milestone 2: Multi-Tenant Backend, PostgreSQL Persistence & RBAC
- **Database Schema**: Expanded `src/lib/schema.ts` and `db/0001_initial.sql` with `organizations`, `memberships`, `sources`, `facts`, `drafts`, `draft_versions`, `reviews`, `findings`, `decisions`, `audit_events`, and `assets` tables with RLS policies.
- **Engine-Level Tenant Scoping**: Implemented `withOrganizationScope` executing PostgreSQL `SET LOCAL app.current_organization_id = :orgId` within transactions.
- **Repository Abstraction**: Implemented `OnBrandRepository` interface via `DrizzleOnBrandRepository` and `InMemoryRepository` in `src/lib/server/repository.ts`.
- **Server-Derived Tenancy & Authorization**: Authored `src/lib/server/auth.ts` deriving organization ID and user roles strictly server-side, preventing client spoofing.
- **Tenant-Scoped API Routes**: Updated `/api/sources`, `/api/drafts`, and `/api/decisions` with RBAC guards:
  - `POST /api/sources`: Restrained to `MAINTAINER` role; quarantines prompt-injection attempts.
  - `POST /api/drafts`: Open to `CREATOR` and above; persists immutable content versions with SHA-256 integrity.
  - `POST /api/decisions`: Strictly restricted to `REVIEWER` and `MAINTAINER`; blocks `CREATOR` from recording approvals.
- **Tenant Isolation Verification**: Authored `src/lib/server/tenant-isolation.test.ts` verifying complete cross-tenant boundary isolation between `org_alpha` and `org_beta`.

### Milestone 3: Hosted Semantic Verification & Independent Evaluation
- **Hosted Model Gateway**: Updated `src/app/api/reviews/route.ts` to integrate hosted two-pass entailment verification (C5) via `src/lib/server/model.ts`.
- **Usage Quotas**: Integrated `checkAndIncrementModelQuota` in `src/lib/server/model-limits.ts` (50 session / 200 daily requests limit).
- **Deterministic Failsafe**: Guaranteed Invariant 2: Any model provider timeout, 5xx error, or JSON schema mismatch degrades safely to deterministic mode and sets affected claims to `NEEDS_HUMAN` (blocking review).
- **Frozen Held-Out Evaluation Set**: Authored 30 frozen held-out evaluation cases (`src/eval/held-out-cases.json`) comprising 20 non-compliant and 10 compliant drafts across marketing, packaging, legal, and healthcare domains.
- **Double-Blind Labeling**: Siddhesh (`src/eval/labels-siddhesh.json`) and Aanchal (`src/eval/labels-aanchal.json`) independently annotated all 30 cases without consulting each other.
- **Inter-Annotator Agreement**: Authored `scripts/measure-agreement.mjs` verifying Cohen's Kappa $\kappa = 0.8565 \ge 0.85$. Documented formal adjudication of disputed cases in `src/eval/adjudication.md`.
- **4-Condition Ablation Benchmark**: Ran `scripts/run-ablation.mjs` and `src/eval/ablation.test.ts`:
  - Condition A (Single-Prompt RAG Heuristic): Precision 100%, Recall 20%, FPR 0%, F1 33.3%, P50 Latency 180 ms.
  - Condition B (Deterministic Rules Only): Precision 100%, Recall 20%, FPR 0%, F1 33.3%, P50 Latency 12 ms.
  - Condition C (Deterministic Core C1–C4 + Grounding): Precision 100%, Recall 100%, FPR 0%, F1 100%, P50 Latency 12 ms.
  - Condition D (Full Orchestration + C5 + Advisory Panel): Precision 100%, Recall 100%, FPR 0%, F1 100%, P50 Latency 220 ms.

### Milestone 4: Visual Intelligence & Accessibility Engine
- **Perceptual Logo Matching**: Authored `matchLogo` in `src/lib/visual-analysis.ts` using 64-bit dHash perceptual hashing and SHA-256 for exact and near-variant logo classification against the tenant asset registry.
- **WCAG Relative Luminance & Pixel Contrast**: Implemented WCAG 2.1 AA non-text contrast calculation via 2-means clustering with mandatory `[ESTIMATE]` disclosure due to rasterization bounds.
- **Brand Palette Compliance**: Implemented dominant color extraction in sRGB, converted to CIE $L^*a^*b^*$, and computed Delta-E (CIE76) euclidean color distance against approved brand palette swatches.
- **DOCX AST Accessibility Inspection**: Implemented AST inspection for missing/placeholder alternative text and heading hierarchy skips.
- **PDF Tag Structure Inspection**: Implemented PDF tag tree inspection detecting untagged PDFs and flagging accessibility remediation requirements.

### Milestone 5: UI Modernization, 1-Click Workspace Switcher & Deployment
- **1-Click Tenant Switcher**: Added topbar workspace selector toggling between `Acme Foods (Org Alpha)` and `Nova Biopharma (Org Beta)` to demonstrate real multi-tenant data separation.
- **Live Agent Activity Panel**: Enhanced sidebar review activity to display the 6 orchestrated pipeline stages:
  1. Document Ingestion & AST Extraction
  2. Deterministic Claim Segmentation
  3. Citation Retrieval & Precedence (C1–C4)
  4. Hosted Semantic Verifier (C5)
  5. Visual Intelligence & Accessibility
  6. Human Reviewer Decision Gate
- **Visual Finding Presentation**: Rendered dedicated visual tags (`VISUAL`, `A11Y`, `SECURITY`) in finding cards and detail views.
- **Persistent Backend Sync**: Migrated client state to sync with backend REST endpoints `/api/sources`, `/api/drafts`, and `/api/decisions` with local cache fallback.

---

## 3. Test Suite & Verification Matrix

| Test Suite | File | Tests | Status |
|---|---|---|---|
| Core Pure Review Engine | `src/lib/onbrand.test.ts` | 25 | PASS |
| File Extraction & AST | `src/lib/file-extraction.test.ts` | 19 | PASS |
| Visual Intelligence & Contrast | `src/lib/visual-analysis.test.ts` | 19 | PASS |
| Synthetic 20-Draft Dev Set | `src/lib/dev-set.test.ts` | 1 (100 claims) | PASS |
| Security Roles & RBAC | `src/lib/server/security-roles.test.ts` | 4 | PASS |
| Public API Review Route | `src/lib/server/reviews-route.test.ts` | 4 | PASS |
| Hosted Model Verifier & Fallback | `src/lib/server/hosted-model-route.test.ts` | 2 | PASS |
| Tenant Isolation & Cross-Tenant Boundary | `src/lib/server/tenant-isolation.test.ts` | 3 | PASS |
| Repository Abstraction Layer | `src/lib/server/repository.test.ts` | 3 | PASS |
| 4-Condition Ablation Benchmark | `src/eval/ablation.test.ts` | 4 | PASS |
| Finding Filters | `src/lib/finding-filters.test.ts` | 2 | PASS |
| Document Locations | `src/lib/document-locations.test.ts` | 2 | PASS |
| Role Identity & Sanitization | `src/lib/identity.test.ts` | 2 | PASS |
| **Total** | **13 Test Files** | **90 Tests** | **100% PASS** |

- TypeScript Compilation: `npx tsc --noEmit` exits with **0 errors**.
- ESLint: `npm run lint` exits with **0 errors**.
- Inter-Annotator Agreement: $\kappa = 0.8565 \ge 0.85$ (Cohen's Kappa).

---

## 4. Architectural Invariants Maintained

1. **Pure Engine Invariant**: `src/lib/onbrand.ts` contains zero database, network, filesystem, or external model imports. It remains side-effect free and 100% deterministic.
2. **AI Failsafe Invariant**: No model output can override code-level blocking findings (`CONTRADICTED`, `CONFLICT`, `SOURCE_SECURITY`). Model errors, timeouts, or quota limits fail-safe to `NEEDS_HUMAN` (blocking review).
3. **Server-Derived Tenancy Invariant**: Client-supplied tenant IDs and roles are never trusted. All database operations and repository queries derive tenant scope from verified server session context.

