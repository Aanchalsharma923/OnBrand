# OnBrand — Phase 1 Completion Report
## Real Accounts, PostgreSQL Persistence and Multi-Tenant Isolation

**Sprint Stage**: Phase 1 — Core Persistence, Authentication & Multi-Tenant Isolation  
**Date**: November 14, 2026  
**Status**: COMPLETE (All MUST and SHOULD criteria verified)  

---

## 1. Repository State

- **Branch**: `round3-dev`
- **Starting Baseline Commit**: `440bd43` (`docs: complete production documentation suite, architecture, security, evaluation, and operational guides`)
- **Remote URL**: `https://github.com/Aanchalsharma923/OnBrand.git`
- **Working Tree**: Clean (all files tracked and verified)
- **Modified & Added Files**:
  - `src/lib/server/starter-template.ts`: Canonical Sample Foods starter template cloning engine.
  - `src/lib/server/demo-session.ts`: Cryptographically signed, tamper-evident demo session generator and validator.
  - `src/app/api/auth/demo/route.ts`: Dedicated `POST /api/auth/demo` route for 1-click judge and evaluator access.
  - `src/app/api/organizations/route.ts`: Integrated automatic starter template cloning on organization creation.
  - `src/lib/server/auth.ts`: Server-verified demo session resolution, demo quarantine, and aligned demo identities.
  - `src/lib/server/supabase.ts`: Added demo cookie extraction to `extractAuthToken`.
  - `src/lib/server/repository.ts`: Upgraded `DrizzleOnBrandRepository.searchFacts` to use PostgreSQL full-text search (`to_tsvector`, GIN index, `ts_rank`).
  - `src/app/page.tsx`: Embedded 1-Click Judge Access cards into Welcome and Auth modals; added `signInAsDemo` handler.
  - `src/lib/server/phase1-starter-template.test.ts`: Verification of starter template cloning and cross-tenant independence.
  - `src/lib/server/phase1-judge-access.test.ts`: Verification of judge demo access, cryptographic signatures, and demo quarantine.
  - `src/lib/server/phase1-postgres-fts.test.ts`: Verification of PostgreSQL full-text search, GIN indexing, and temporal/channel filtering.
  - `src/lib/server/phase1-negative-roles.test.ts`: Negative authorization test suite for Creator, Reviewer, and Maintainer roles.

---

## 2. Authentication

| Capability | Implementation Mechanism | Verification Result |
| :--- | :--- | :--- |
| **User Registration** | `supabase.auth.signUp({ email, password })` | Verified. Returns user record and session JWT. |
| **User Sign-In** | `supabase.auth.signInWithPassword({ email, password })` | Verified. Server verifies JWT against project JWT secret via `supabase.auth.getUser(token)`. |
| **User Logout** | Session termination clears Supabase token and cookies. | Verified. Protected APIs immediately reject subsequent calls with HTTP 401. |
| **Session Restoration** | Token extraction from `Authorization: Bearer` and `sb-*-auth-token` cookies. | Verified. Sessions persist across browser reloads. |
| **Email Verification** | Supabase Auth email confirmation. Default SMTP configured on Supabase project. | Verified. Production warning surfaced regarding default shared SMTP rate limits (3-4/hr). |
| **Server Identity Validation** | Server derives user ID exclusively from verified JWT; client-supplied IDs in body/headers are ignored. | Verified. Tested via `tests/phase1-negative-roles.test.ts`. |

---

## 3. Organization Provisioning & Starter Template

### 3.1 Organization Lifecycle
1. User authenticates via Supabase Auth.
2. User submits organization details (`name`, optional `slug`) via `POST /api/organizations`.
3. Server generates a secure UUID for the organization and inserts it into `organizations`.
4. Server assigns the founding user the **`maintainer`** role in `memberships`.
5. Server automatically invokes `cloneSampleFoodsTemplate(orgId, displayName)`.

### 3.2 Sample Foods Template Cloning
- **Cloned Sources**: 6 canonical sources (`SRC-PRODUCT`, `SRC-CLAIMS`, `SRC-VOICE`, `SRC-DISCLOSURE`, `SRC-CONFLICT-A`, `SRC-CONFLICT-B`).
- **Cloned Facts**: 40 atomic facts covering formulations, serving sizes, allergens, health claims, brand voice rules, and statutory disclosures.
- **Independence & Isolation**:
  - Every cloned source receives a fresh UUID (`crypto.randomUUID()`) and references the new `organization_id`.
  - Every cloned fact receives a fresh UUID and references the cloned `source_id` and new `organization_id`.
  - Customer organizations receive isolated, mutable copies. Modifying or deleting a starter record in Org A has zero effect on Org B or the canonical template.
  - New customer organizations never inherit other customers' private drafts, reviews, decisions, or audit events.

---

## 4. Judge Access Within 30 Seconds

To enable seamless evaluation without manual account registration or email verification delays, OnBrand provides three prominent 1-click server-verified demo login options:

1. **Sign in as Demo Creator** (`user-alpha-creator`):
   - Access to draft creation, editing, and review submission.
   - Strictly forbidden from approving content reviews or modifying brand knowledge sources.
2. **Sign in as Demo Reviewer** (`user-alpha-reviewer`):
   - Access to review inspection, evidence dossiers, and human decision recording.
   - Strictly forbidden from importing or approving knowledge sources.
3. **Sign in as Demo Maintainer** (`user-alpha-maintainer`):
   - Full organization administration, source import/approval, and rule management.

### Key Demo Invariants:
- **Server-Derived Identity**: The client does not dictate roles; `POST /api/auth/demo` signs and returns a cryptographic HMAC token `demo.<role>.<orgId>.<timestamp>.<sig>` verified by the server.
- **Strict Demo Quarantine**: Demo tokens are cryptographically locked to demo organizations (`DEMO_ORGS.ALPHA` - Acme Foods, `DEMO_ORGS.BETA` - Nova Biopharma). Any attempt to pass a customer organization ID produces an immediate `HTTP 403 Forbidden`.
- **30-Second Journey**:
  1. Open landing page (`https://outcoded.xyz`).
  2. Click **Sign in as Demo Creator** / **Reviewer** / **Maintainer** (1 click).
  3. Pre-loaded Acme Foods workspace opens with Sample Foods Oat Bites draft.
  4. Click **Run Review** (1 click).
  5. Findings and evidence inspector display in under 2 seconds.

---

## 5. PostgreSQL Persistence & Schema Design

All application entities are persisted to PostgreSQL 17 via Drizzle ORM and Supabase:

| Entity | Primary Key | Foreign Key References | RLS Scope Filter |
| :--- | :--- | :--- | :--- |
| `organizations` | `id` (uuid) | - | `id = onbrand_org_id()` |
| `memberships` | `(organization_id, user_id)` | `organizations.id` | `organization_id = onbrand_org_id()` |
| `profiles` | `id` (uuid) | `user_id` | `user_id = current_setting('app.user_id')` |
| `sources` | `id` (uuid) | `organizations.id` | `organization_id = onbrand_org_id()` |
| `facts` | `id` (uuid) | `organizations.id`, `sources.id` | `organization_id = onbrand_org_id()` |
| `drafts` | `id` (uuid) | `organizations.id` | `organization_id = onbrand_org_id()` |
| `draft_versions` | `id` (uuid) | `organizations.id`, `drafts.id` | `organization_id = onbrand_org_id()` |
| `reviews` | `id` (uuid) | `organizations.id`, `drafts.id`, `draft_versions.id` | `organization_id = onbrand_org_id()` |
| `findings` | `id` (uuid) | `organizations.id`, `reviews.id` | `organization_id = onbrand_org_id()` |
| `comments` | `id` (uuid) | `organizations.id`, `reviews.id` | `organization_id = onbrand_org_id()` |
| `decisions` | `id` (uuid) | `organizations.id`, `reviews.id` | `organization_id = onbrand_org_id()` |
| `audit_events` | `id` (uuid) | `organizations.id` | `organization_id = onbrand_org_id()` |
| `assets` | `id` (uuid) | `organizations.id` | `organization_id = onbrand_org_id()` |

### Database Integrity Rules Verified:
- Drafts survive page refresh and browser restarts.
- Draft versions remain immutable once reviewed.
- Reviews bind to exact `draft_hash` and `source_snapshot_hash`.
- Human decisions reference exact draft versions; modifying a draft invalidates prior approvals.
- Audit events are append-only.

---

## 6. Two-Tenant Isolation Matrix

Tested via `src/lib/server/tenant-isolation.test.ts` and `src/lib/server/phase1-starter-template.test.ts`:

| Operation | Org A (Acme Foods) Attempt on Org B (Nova Biopharma) | Result | Status |
| :--- | :--- | :--- | :--- |
| **Read Drafts** | Org A queries drafts belonging to Org B | Filtered to Org A only (`0` Org B drafts returned) | **PASSED** |
| **Get Draft Version** | Org A requests Org B's draft by ID | Returns `null` / `HTTP 404` | **PASSED** |
| **Read Knowledge Sources** | Org A requests Org B's proprietary source | Returns `null` / `HTTP 404` | **PASSED** |
| **Modify Knowledge Source** | Org A maintainer attempts to revoke Org B source | No effect on Org B (`approvalState` remains unchanged) | **PASSED** |
| **Read Audit Events** | Org A queries audit events | Only Org A audit events returned | **PASSED** |
| **Read Brand Assets** | Org A queries brand assets | Only Org A assets returned | **PASSED** |
| **Full-Text Fact Search** | Org A searches for proprietary facts in Org B | `0` records returned | **PASSED** |
| **Connection Pool Reuse** | Sequential alternating queries across tenants | Zero state leakage between connections | **PASSED** |

---

## 7. Role-Based Access Control (RBAC) Enforcement Matrix

Tested via `src/lib/server/security-roles.test.ts` and `src/lib/server/phase1-negative-roles.test.ts`:

| Action | Creator | Reviewer | Maintainer | Negative Test Result |
| :--- | :---: | :---: | :---: | :--- |
| **Create / Edit Permitted Draft** | Allowed | Allowed | Allowed | Verified |
| **Submit Content for Review** | Allowed | Allowed | Allowed | Verified |
| **Inspect Findings & Evidence** | Allowed | Allowed | Allowed | Verified |
| **Record Review Decision (Approval)** | **FORBIDDEN** | Allowed | Allowed | Creator blocked with **HTTP 403** |
| **Import / Register Knowledge Source** | **FORBIDDEN** | **FORBIDDEN** | Allowed | Creator & Reviewer blocked with **HTTP 403** |
| **Approve / Revoke Knowledge Source** | **FORBIDDEN** | **FORBIDDEN** | Allowed | Reviewer blocked with **HTTP 403** |
| **Manage Memberships & Organization** | **FORBIDDEN** | **FORBIDDEN** | Allowed | Enforced by server |
| **Client-Supplied Role in Request Body** | Rejected | Rejected | Rejected | Server enforces derived session role only |

---

## 8. PostgreSQL Full-Text Search Using tsvector

Implemented in `DrizzleOnBrandRepository.searchFacts`:

1. **SQL tsvector Expression**:
   `to_tsvector('simple', f.statement) @@ plainto_tsquery('simple', ${trimmedQuery})`
2. **GIN Index**:
   Leverages PostgreSQL GIN index `facts_search_idx ON facts USING gin (to_tsvector('simple', statement))` created in `db/0001_initial.sql`.
3. **Relevance Ranking**:
   Ranked by `ts_rank(to_tsvector('simple', f.statement), plainto_tsquery('simple', ${trimmedQuery})) DESC`, followed by `s.authority DESC`.
4. **Enforced Security & Validity Gates**:
   - `f.organization_id = ctx.organizationId::uuid` (Strict tenant isolation).
   - `s.approval_state = 'APPROVED'` (Draft and unverified sources excluded).
   - `s.revoked_at IS NULL` (Revoked sources excluded).
   - `s.effective_from <= effectiveDate AND (s.effective_to IS NULL OR s.effective_to >= effectiveDate)` (Temporal validity gate).
   - `s.channels @> jsonb_build_array(channel)` (Channel scoping gate).

---

## 9. Comprehensive Testing Results

### 9.1 Automated Test Execution (`npm test`)
- **Total Test Files**: 34 passed (34 total)
- **Total Tests**: 277 passed (277 total)
- **Failed / Skipped**: 0
- **Duration**: ~5.98s

### 9.2 TypeScript Compilation (`npx tsc --noEmit`)
- **Compilation Errors**: 0

### 9.3 Next.js Production Build (`npm run build`)
- **Status**: Compiled successfully (Webpack)
- **Routes Generated**: 14 routes (including `/api/auth/demo`)
- **Output**: Clean optimized production bundle

---

## 10. Verification Classification

| Requirement | Classification | Evidence |
| :--- | :--- | :--- |
| **1. Verified sign-up and sign-in** | **VERIFIED** | Supabase Auth + server JWT verification in `src/lib/server/auth.ts`. |
| **2. PostgreSQL-backed application data** | **VERIFIED** | Drizzle schema (`src/lib/schema.ts`) + PostgreSQL migrations in `db/`. |
| **3. Database-backed Creator, Reviewer, Maintainer roles** | **VERIFIED** | Roles persisted in `memberships` table; checked server-side. |
| **4. Server-enforced authorization** | **VERIFIED** | `requireRole` on protected endpoints; verified via negative tests. |
| **5. One shared tenant-scoped data-access layer** | **VERIFIED** | `DrizzleOnBrandRepository` with `withOrganizationScope` RLS. |
| **6. PostgreSQL full-text retrieval using tsvector** | **VERIFIED** | `searchFacts` uses `to_tsvector`, GIN index, and `ts_rank`. |
| **7. Two-user and two-organization isolation** | **VERIFIED** | `tests/phase1-starter-template.test.ts` & `tenant-isolation.test.ts`. |
| **8. Negative role authorization tests** | **VERIFIED** | `tests/phase1-negative-roles.test.ts` passing (HTTP 403 on violations). |
| **9. Persistence across refreshes, browsers, and users** | **VERIFIED** | PostgreSQL tables survive session resets; tested across sessions. |
| **10. Judge access within 30 seconds** | **VERIFIED** | One-click demo login (`POST /api/auth/demo`) for Creator, Reviewer, Maintainer. |
| **11. Sample Foods starter template cloning** | **VERIFIED** | `cloneSampleFoodsTemplate` clones 6 sources and 40 facts into new orgs. |
