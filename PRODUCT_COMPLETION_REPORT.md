# OnBrand — Product Completion Sprint Report

**Target Platform:** OnBrand Enterprise Pre-Publication Brand Governance & Content Review  
**Live Production URL:** [https://outcoded.xyz](https://outcoded.xyz)  
**Vercel Production Deployment Alias:** `https://on-brand-awsgz25ci-sidsongare-9150.vercel.app`  
**Git Repository Branch:** `round3-dev`  
**Git Base Reference:** `round2-final`  
**Supabase PostgreSQL Project ID:** `zmnehuiiopwerbtjxxqt`  
**Regional Transaction Pooler:** `aws-1-ap-southeast-1.pooler.supabase.com:6543`  
**Test Suite:** 27 test files, 224 unit and integration tests passing (100%)  
**Type Safety:** TypeScript 5.8 `tsc --noEmit` passing (0 errors)  
**Linter:** ESLint clean (0 errors)  
**Production Build:** Next.js 16.4.5 (13 static pages, 9 dynamic serverless endpoints)  

---

## 1. Executive Summary & Product Scope

OnBrand is an evidence-led pre-publication brand-governance and content-review platform. It helps organizations check draft marketing and communications content against approved brand identity, versioned knowledge, evidence, and regulatory rules before publication.

This sprint successfully transitions OnBrand from a judge-ready prototype into a deployed, hardened, and demonstrably usable multi-tenant product:
1. **Preserved Core Invariants:** All deterministic claim extraction, hybrid lexical/trigram evidence retrieval, source precedence, C1–C4 citation verification, and frozen accuracy benchmarks (100% precision on the 52-passage frozen set and 10-brand suite) are completely preserved.
2. **Real Authentication & Tenancy:** Integrated Supabase Auth (JWT verification, session handling, email/password signup and login) with server-side organization onboarding. Real multi-tenant data access is secured by PostgreSQL Row-Level Security (RLS) with explicit `SET LOCAL ROLE authenticated` and tenant/user/role GUC context inside every transaction.
3. **Persistent Customer Workflow:** The full golden customer loop is connected end-to-end:
   $$\text{User Onboarding} \longrightarrow \text{Brand Knowledge Setup} \longrightarrow \text{Draft Submission} \longrightarrow \text{Evidence Review} \longrightarrow \text{Correction/Re-review} \longrightarrow \text{Human Decision Gate} \longrightarrow \text{Versioned Persistence}$$
4. **Strict Role Separation (RBAC):** Content creators are strictly forbidden from approving drafts or recording pre-publication decisions (HTTP 403). Review decisions require an authorized Reviewer or Maintainer role.
5. **Multi-Jurisdiction & Regulatory Intelligence:** Integrated deterministic rules for sugar claims, nutrient thresholds, and high-risk health terms across US FDA (21 CFR § 101), UK ASA/CAP, and EU FIC (EC 1924/2006).
6. **Visual & Accessibility Intelligence:** SHA-256 and 64-bit dHash logo matching against approved registries, WCAG 2.1 AA luminance contrast estimation explicitly labeled `[ESTIMATE]`, and structured DOCX tag/heading-order analysis. Uncertain visual results safely route to `NEEDS_HUMAN`.

---

## 2. Baseline Audit (Pre-Sprint vs. Completed State)

| Capability / Component | Pre-Sprint Baseline | Sprint Completed State |
| :--- | :--- | :--- |
| **Authentication** | Local simulation / role picker dropdown | Real Supabase Auth (email/password, JWT verification, session listener, server auth context) |
| **Workspace Tenancy** | Single browser `localStorage` demo records | Multi-tenant organization isolation in PostgreSQL with RLS and GUC lowering |
| **Role Authorization** | Client-side role selection only | Server-enforced RBAC (`creator`, `reviewer`, `maintainer`) with 403 Forbidden enforcement |
| **Database Persistence** | Schema defined in `db/0001_initial.sql` but not connected to UI | Fully connected Drizzle repository layer for sources, facts, drafts, versions, reviews, decisions, and audit events |
| **Review Engine** | Deterministic C1–C4, 52-passage frozen benchmark (100% precision) | Fully preserved; 100% precision, 0 false positives, 100% citation validity |
| **Visual Analysis** | Prototype standalone unit tests | Integrated visual engine: SHA-256 / dHash logo matching, contrast estimation, DOCX tag validation |
| **Production Deployment** | Temporary preview | Deployed to Vercel production on custom domain `https://outcoded.xyz` |

---

## 3. Deliberately Preserved Architectural Invariants

In accordance with product engineering discipline and sprint rules:
- **No LLM Replacement of Deterministic Engine:** The pure review engine in `src/lib/onbrand.ts` remains completely deterministic.
- **Evidence State Taxonomy Preserved:**
  - `SUPPORTED`: Claim supported by eligible approved evidence.
  - `CONTRADICTED`: Claim directly conflicts with approved evidence.
  - `NO_APPROVED_EVIDENCE`: No eligible evidence available; explicitly does *not* prove false.
  - `CONFLICT`: Equally authoritative applicable sources disagree.
  - `NEEDS_HUMAN`: Uncertainty or visual ambiguity requires human judgment.
- **Immutable Human Decision Gate:** OnBrand never publishes content or autonomously approves it. Approvals are human decisions tied to the exact reviewed content hash and source snapshot hash.
- **Stale Decision Invalidation:** Any edit to the draft content or change to approved knowledge immediately clears the prior decision and requires a fresh review.
- **OCR Proofread Gate:** Low-confidence extracted text is gated from review until manually edited and confirmed.

---

## 4. Summary of Code & Test Changes

### Modified & Created Files
1. `src/app/page.tsx`:
   - Connected Supabase Auth session listener and modal.
   - Dynamic organization switcher querying `GET /api/organizations`.
   - Onboarding modal for fresh users with 0 organizations.
   - Synchronizes persistent sources, drafts, and reviews with PostgreSQL.
   - Brand profile edits persist to `POST /api/sources`.
   - Decision controls enforce Reviewer/Maintainer roles; Creator role is informed and blocked.
2. `src/app/api/organizations/route.ts`:
   - Authenticated user resolution via Supabase Auth JWT.
   - Creates organization record and assigns server-enforced `creator` role to first member.
   - Returns user's active organizations and roles.
3. `src/app/api/decisions/route.ts`:
   - Server-side role enforcement via `requireRole(ctx, ["reviewer", "maintainer"])`.
   - Returns 403 Forbidden if called by a `creator`.
   - Null-safe actor attribution fallback to user ID.
4. `src/app/api/sources/route.ts`:
   - Null-safe actor attribution on source creation and status updates.
5. `src/lib/server/repository.ts`:
   - Corrected review retrieval matching in `InMemoryRepository` for draft version lookups.
6. `src/lib/server/golden-journey.test.ts`:
   - 7 end-to-end integration tests verifying the full 15-point customer journey.

---

## 5. Verification & Test Evidence

### Test Suite Execution
```text
$ npm test

 RUN  v5.1.0 C:/Users/aanch/.../OnBrand-round2

 ✓ src/lib/file-extraction.test.ts (19 tests)
 ✓ src/eval/accuracy-benchmark.test.ts (3 tests)
 ✓ src/eval/ablation.test.ts (4 tests)
 ✓ src/lib/identity.test.ts (2 tests)
 ✓ src/lib/visual-analysis.test.ts (19 tests)
 ✓ src/lib/dev-set.test.ts (1 test)
 ✓ src/lib/onbrand.test.ts (25 tests)
 ✓ src/eval/global-evaluation.test.ts (4 tests)
 ✓ src/lib/server/hybrid-llm-evaluation.test.ts (11 tests)
 ✓ src/lib/multi-format-suite.test.ts (14 tests)
 ✓ src/lib/multimodal-workspace.test.ts (16 tests)
 ✓ src/lib/server/supabase.test.ts (38 tests)
 ✓ src/lib/docx-export.test.ts (1 test)
 ✓ src/lib/finding-enhancer.test.ts (6 tests)
 ✓ src/lib/document-locations.test.ts (2 tests)
 ✓ src/lib/finding-filters.test.ts (2 tests)
 ✓ src/lib/server/database-integration.test.ts (10 tests)
 ✓ src/lib/server/adversarial-attacks.test.ts (12 tests)
 ✓ src/lib/server/auth.test.ts (5 tests)
 ✓ src/lib/server/reviews-route.test.ts (4 tests)
 ✓ src/lib/server/hosted-model-route.test.ts (2 tests)
 ✓ src/app/api/files/route.test.ts (1 test)
 ✓ src/lib/server/security-roles.test.ts (4 tests)
 ✓ src/lib/server/golden-journey.test.ts (7 tests)
 ✓ src/lib/server/tenant-isolation.test.ts (6 tests)
 ✓ src/lib/server/repository.test.ts (3 tests)
 ✓ src/app/api/organizations/route.test.ts (3 tests)

 Test Files  27 passed (27)
      Tests  224 passed (224)
   Duration  5.81s
```

### Frozen Benchmark Results (52 Passages)
- **True Positives:** 22
- **False Positives:** 0
- **True Negatives:** 30
- **False Negatives:** 0
- **Precision:** 100.00% (Target $\ge$ 95%)
- **Recall:** 100.00% (Target $\ge$ 90%)
- **False-Positive Rate:** 0.00% (Target $\le$ 5%)
- **False-Negative Rate:** 0.00% (Target $\le$ 10%)
- **Unsupported-to-Contradicted Error Rate:** 0
- **Citation Validity:** 100.00%
- **Highlight Accuracy:** 100.00%

### TypeScript & Linter Verification
- `npx tsc --noEmit`: 0 errors.
- `npm run lint`: 0 errors.

---

## 6. Model Disclosure & Evaluation Limitations

- **Engine Mode:** Default production execution operates in **Deterministic Mode** (`deterministic-preview`), executing local claim extraction, lexical/trigram retrieval, rule checks, and citation verification with zero external model calls.
- **Hosted Model Activation:** Strictly server-gated by the `ENABLE_HOSTED_MODEL=true` environment variable and valid server credentials.
- **Advisory Only:** External models never alter factual findings, cannot suppress deterministic violations, and cannot approve content.
- **Failure Degrades Safely:** In the event of model timeouts, quota exhaustion, or ungrounded citations, the system falls back to deterministic findings and routes ambiguous claims to `NEEDS_HUMAN`.
- **Honest Disclosure:** No model-assisted label is ever shown to the user unless an actual model call was executed and verified.

---

## 7. Repeatable End-to-End Demo Script

To demonstrate the complete customer workflow in production:
1. **Access Application:** Open `https://outcoded.xyz` in a web browser.
2. **Sign In / Onboard:** Click **Sign In**, create a new account or authenticate.
3. **Workspace Initialization:** The system loads your organizations. If none exist, the onboarding modal prompts for your organization name and creates a isolated tenant.
4. **Brand Knowledge Review:** Navigate to the **Knowledge base** tab. View approved sources. As a Maintainer, update brand voice or add custom packaging claims.
5. **Draft Submission:** In the **Editor**, submit draft copy containing a prohibited or unverified claim (e.g. *"Our oat bar is a miracle cure packed with 20g protein"*).
6. **Execute Review:** Click **Run review**. The Findings panel immediately displays:
   - Highlighting at exact UTF-16 / Unicode code-point offsets.
   - Classification: `CONFIRMED_VIOLATION` or `UNSUPPORTED_CLAIM`.
   - Severity and actionable explanation.
7. **Role Gate Verification:** As a Content Creator, observe that the **Approve version** button is disabled with the notice: *"Switch to Reviewer or Maintainer to record the human decision."*
8. **Correction & Version Increment:** Correct the claim in the editor to *"Our oat bar contains 10g of protein and whole grain oats."* Saving increments the version to `v2`.
9. **Re-Review:** Re-run the review. Observe that the prior violation is cleared and the new version hash is computed.
10. **Human Approval:** As a Reviewer, click **Approve version**. The decision is permanently recorded with the reviewer's identity, timestamp, draft hash, and knowledge snapshot hash.
11. **Session Persistence:** Refresh the browser page or sign in from an incognito window. The workspace, draft history, review findings, and approved decision are fully restored.
12. **Multi-Tenant Isolation:** Sign in as a user from a different organization. Verify that zero drafts, sources, or reviews from the first organization are visible or accessible.

---

## 8. Release Status

The OnBrand application meets all core functional, security, and architectural criteria outlined in the 24-Hour Product Completion Sprint. The production deployment at `https://outcoded.xyz` is live and operational.

