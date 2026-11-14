# OnBrand — System Architecture & Design

## 1. High-Level Architecture Topology

OnBrand is engineered as a modern, multi-tenant brand governance platform with strict isolation between client presentation, server-side orchestration, persistent storage, and review intelligence.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        NEXT.JS CLIENT APPLICATION                      │
│  React 19 / TypeScript / Tailwind CSS / Radix UI / Accessible Modals   │
│  ├─ Workspace Navigation & Review Studio (Tabs: Review, KB, Audit, Org)│
│  ├─ Local Document Ingestion: PDF.js, Mammoth (DOCX), JSZip (PPTX/XLSX)│
│  ├─ Browser OCR Engine: Tesseract.js (Client-side WebAssembly)         │
│  └─ Supabase Auth Client: Session extraction & Bearer JWT propagation  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (Bearer JWT / Tenant Header)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     NEXT.JS ROUTE HANDLERS & APIS                      │
│  Node.js Runtime / Vercel Serverless Edge                              │
│  ├─ /api/organizations  -> Tenant onboarding & membership query        │
│  ├─ /api/sources        -> Knowledge source registration & retrieval   │
│  ├─ /api/drafts         -> Content drafting & SHA-256 fingerprinting   │
│  ├─ /api/reviews        -> Deterministic review engine orchestration   │
│  ├─ /api/decisions      -> Approval workflow & version integrity gate │
│  ├─ /api/audit          -> Tenant-partitioned audit log queries        │
│  └─ /api/assets         -> Multimodal brand asset registry             │
└───────────────────┬─────────────────────────────────┬──────────────────┘
                    │                                 │
                    ▼                                 ▼
┌───────────────────────────────────────┐ ┌──────────────────────────────┐
│      SERVER-SIDE AUTH & CONTEXT       │ │  DETERMINISTIC REVIEW ENGINE │
│  resolveTenantContext()               │ │  src/lib/onbrand.ts          │
│  ├─ Supabase Auth getUser(token)      │ │  ├─ Atomic claim extraction  │
│  ├─ Membership verification (Postgres)│ │  ├─ Fact matching & ranking  │
│  ├─ ServerRole derivation             │ │  ├─ Statutory precedence     │
│  └─ Fail-closed tenant isolation      │ │  └─ C1–C4 Citation validation│
└───────────────────┬───────────────────┘ └──────────────┬───────────────┘
                    │                                    │
                    │ Drizzle ORM / pg connection pooler │ Optional C5
                    ▼                                    ▼
┌───────────────────────────────────────┐ ┌──────────────────────────────┐
│      SUPABASE POSTGRESQL 17 DATABASE  │ │  HOSTED MODEL GATEWAY (LLM)  │
│  Supabase Transaction Pooler (Port 6543)│ OpenAI-compatible API        │
│  ├─ Organizations & Memberships       │ │ (Optional semantic verifier) │
│  ├─ Sources & Source Facts            │ │ Default: Disclosed           │
│  ├─ Drafts & Draft Versions           │ │ Deterministic Mode           │
│  ├─ Reviews & Findings                │ └──────────────────────────────┘
│  ├─ Decisions & Sign-offs             │
│  └─ Row Level Security (RLS) Policies │
└───────────────────────────────────────┘
```

---

## 2. Core Architectural Invariants

### 1. Pure Review Engine Invariant
The review core (`src/lib/onbrand.ts`) is a **pure, side-effect-free library**:
- Performs no network requests, file system access, or database calls.
- Given an identical `(Draft, Source[])` tuple, it produces an identical `Review` output with 100% deterministic reproducibility.
- All database queries, authentication checks, and network calls are handled strictly at the API layer (`src/app/api/`) and repository layer (`src/lib/server/repository.ts`).

### 2. Zero-Trust Content Hashes
The server never trusts client-supplied document hashes or version identifiers:
- Every draft is re-hashed using SHA-256 over its normalized UTF-8 byte stream.
- Source snapshots generate a combined cryptographic fingerprint (`sourceSnapshotHash`).
- Review decisions bind immutably to the pair `(reviewId, draftHash)`.

### 3. Server-Enforced Role Resolution
Client-supplied headers such as `x-onbrand-role` are strictly ignored for production authenticated users:
- When an `Authorization: Bearer <jwt>` header is provided, the server queries the database membership table (`memberships`) for `(userId, organizationId)`.
- The user's role (`creator`, `reviewer`, `maintainer`) is derived exclusively from the database record.

---

## 3. Database Design & Relational Schema

The database is built on PostgreSQL 17 via Supabase, modeled with Drizzle ORM ([`src/lib/schema.ts`](file:///c:/Users/aanch/OneDrive/Desktop/Documents/We%20Code%20Coders%20hackathon/OnBrand-round2/src/lib/schema.ts)):

```
┌───────────────────┐       1:N       ┌───────────────────┐
│   organizations   ├────────────────►│    memberships    │
│  id (UUID PK)     │                 │  organization_id  │
│  name, slug       │                 │  user_id, role    │
└─────────┬─────────┘                 └───────────────────┘
          │
          │ 1:N
          ├──────────────────────────┬──────────────────────────┐
          ▼                          ▼                          ▼
┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
│      sources      │      │      drafts       │      │   audit_events    │
│  id, organization │      │  id, organization │      │  id, organization │
│  kind, authority  │      │  title, channel   │      │  action, actor_id │
│  version, state   │      │  content, hash    │      │  entity_type      │
└─────────┬─────────┘      └─────────┬─────────┘      └───────────────────┘
          │                          │
          │ 1:N                      │ 1:N
          ▼                          ▼
┌───────────────────┐      ┌───────────────────┐
│   source_facts    │      │      reviews      │
│  id, source_id    │      │  id, draft_id     │
│  subject, value   │      │  draft_hash       │
│  statement        │      │  findings (JSONB) │
└───────────────────┘      └─────────┬─────────┘
                                     │
                                     │ 1:1
                                     ▼
                           ┌───────────────────┐
                           │     decisions     │
                           │  id, review_id    │
                           │  state, actor_id  │
                           │  draft_hash       │
                           └───────────────────┘
```

### Relational Integrity
- **Foreign Keys**: Cascading deletes (`onDelete: "cascade"`) clean up dependent facts and findings when a parent source or review is removed.
- **Indexes**: Composite indexes on `(organization_id, id)` and `(organization_id, draft_hash)` ensure fast indexed lookups under tenant-isolated queries.
- **Audit Logging**: Every source creation, draft revision, review execution, and human decision records an immutable event in `audit_events`.

---

## 4. Multi-Tenant Isolation & Row Level Security (RLS)

Multi-tenant isolation is enforced at two defense-in-depth tiers:

### Tier 1: Application Layer (`resolveTenantContext`)
Every API endpoint calls `resolveTenantContext(request)`:
1. Validates the incoming Supabase Auth session token via `supabase.auth.getUser(token)`.
2. Queries the user's verified organization memberships in PostgreSQL.
3. If the user requests access to an organization where they lack an active membership record, the server immediately raises `ForbiddenError` (`HTTP 403 Forbidden`).
4. Constructs an immutable `TenantContext` containing `{ organizationId, userId, actor, role }`.

### Tier 2: PostgreSQL Row Level Security (RLS)
Every tenant-scoped table enables RLS (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`):
```sql
CREATE POLICY "tenant_isolation_sources_select" ON public.sources
  FOR SELECT TO authenticated
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY "tenant_isolation_sources_insert" ON public.sources
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid);
```
Unauthenticated requests or requests with mismatched tenant credentials cannot read, insert, update, or delete rows belonging to other organizations.

---

## 5. Review Engine Pipeline

```text
Draft Text
   │
   ▼
[1] Atomic Claim Extraction
   ├─ Sentence splitting with boundary detection
   ├─ Normalized Unicode half-open code point offsets [start, end)
   └─ Entity/Subject extraction
   │
   ▼
[2] Approved Evidence Retrieval
   ├─ Filter KB: approvalState === 'APPROVED' && !revokedAt && effectiveDatesValid
   ├─ Topic Gate: Match on fact subject, attribute, or value
   ├─ Lexical Ranking: BM25/trigram character overlap score
   └─ Authority Sorting: Precedence by Authority Weight (0-100) > Version > Date
   │
   ▼
[3] Deterministic Status Composition
   ├─ Direct Contradiction Check: Numeric or binary polarity mismatch
   │  └─ e.g. "zero sugar" vs fact "4g sugar" -> CONTRADICTED
   ├─ Grounding Check: Complete absence of evidence -> NO_APPROVED_EVIDENCE
   ├─ Precedence Conflict: Equal authority sources asserting different values -> CONFLICT
   ├─ Statutory Enforcement: FDA 21 CFR 101.60, FTC endorsement disclosure rules
   └─ Negative Scope Gate: Verify source channel covers draft channel
   │
   ▼
[4] Citation Verification (C1–C4)
   ├─ C1: Source exists in approved KB
   ├─ C2: Version is active and unrevoked
   ├─ C3: Channel scope matches target
   └─ C4: Quote matches verbatim substring of source statement
   │
   ▼
[5] Optional Neural Semantic Gate (C5)
   ├─ If ENABLE_HOSTED_MODEL=true and OPENAI_API_KEY present:
   │  Two-pass prompt-fenced verification with independent agreement
   └─ If disabled / timeout / quote mismatch:
      Transparent fallback to deterministic mode with honest badge
```

---

## 6. Human Approval & Decision Gate

The approval workflow enforces strict non-repudiation and version freshness:

```
Creator edits draft copy
           │
           ▼
Server increments draft version (e.g. v1 -> v2)
New SHA-256 hash computed
Previous review marked STALE (draftHash mismatch)
           │
           ▼
Creator/Reviewer runs fresh review on v2
Review binds to new draftHash
           │
           ▼
Reviewer initiates approval via POST /api/decisions
           │
           ▼
Server-Side Decision Validation:
  1. Role Check: Is actor role 'reviewer' or 'maintainer'? (Creator -> 403)
  2. Freshness Check: Does review.draftHash === request.draftHash? (Mismatched -> 409)
  3. Contradiction Check: Are any claims CONTRADICTED? (Yes -> 422)
  4. Blocking Findings Check: If blocking items exist, is rationale provided? (No -> 422)
           │
           ▼ All validations pass
Approval committed to database with actor attribution & draft fingerprint (HTTP 200)
```
