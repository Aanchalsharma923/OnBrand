# OnBrand

**Evidence-led brand and regulatory governance for people who publish.**

OnBrand checks marketing copy, packaging labels, regulatory disclosures, and enterprise communications against approved brand guidelines and statutory regulations. It identifies verified claims, unsupported gaps, formulation contradictions, and policy risks, providing rechecked, defensible corrections for human compliance sign-off.

- **Live Production Application**: [https://outcoded.xyz](https://outcoded.xyz)
- **Fallback URL**: [https://on-brand-zeta.vercel.app](https://on-brand-zeta.vercel.app)
- **Primary Repository**: [https://github.com/Aanchalsharma923/OnBrand](https://github.com/Aanchalsharma923/OnBrand)

---

## 1. Problem Statement & Mission

Marketing and compliance teams face severe challenges when publishing regulated copy:
1. **Regulatory Penalties**: Advertising watchdogs (FDA, FTC, EFSA, ASA) penalize misleading claims, improper nutrient descriptors, and unapproved health benefits.
2. **Formulation Drift**: Marketing copy frequently diverges from approved product specifications, ingredient levels, or manufacturing documentation.
3. **The "Black Box AI" Hazard**: Generic LLM assistants hallucinate citations, invent regulatory standards, and deliver ungrounded compliance assertions that cannot be audited.
4. **Approval Bottlenecks**: Manual copy audits create friction, delaying launches without guaranteeing cross-channel consistency.

**OnBrand** eliminates compliance uncertainty by combining deterministic rule-based verification, approved brand knowledge retrieval, and transparent human approval workflows. OnBrand analyzes and recommends; it never publishes content without explicit, authorized human sign-off.

---

## 2. Core Capabilities

- **Inspectable Evidence & Quotations**: Every finding links directly to an approved, versioned primary source with verbatim quotes, version numbers, and authority weights.
- **Strict Compliance Status Composition**: Differentiates clearly between:
  - `SUPPORTED`: Fully verified by an active, approved brand record.
  - `NO_APPROVED_EVIDENCE`: Unverified by existing brand documentation (transparently labeled as missing evidence, not false).
  - `CONTRADICTED`: Directly conflicts with an approved formulation record or statutory regulation (e.g. claiming *"zero sugar"* when records show 4g added sugar).
  - `CONFLICT`: Disagreement between equal-precedence approved sources; escalated for human review rather than silently resolved.
  - `NEEDS_HUMAN`: Ambiguous claims, expired sources, or model uncertainty.
- **C1–C4 Code-Level Citation Validation**: Every cited source is verified against source existence (C1), version and effective dates (C2), target channel scope (C3), and verbatim quotation match (C4).
- **1-Click Suggestion Recheck**: Suggested revisions are re-evaluated through the entire compliance pipeline before application, ensuring a suggestion never introduces new violations.
- **Cryptographic Version Integrity**: Content modifications immediately increment the draft version and compute a new SHA-256 hash. Stale review approvals are rejected by the server (`HTTP 409 Conflict`).
- **Multi-Tenant Isolation**: Enforced via PostgreSQL 17 Row Level Security (RLS) policies and server-side context resolution.
- **Client-Side Multimodal Ingestion**: Supports plain text, Markdown, HTML, Word (.docx), PowerPoint (.pptx), Excel (.xlsx/.csv), PDF documents, image OCR (PNG/JPG/WebP), and video reel frame OCR.

---

## 3. System Architecture

```text
Browser Editor & Review Studio
  ├─ Local Document Ingestion (PDF.js, Mammoth DOCX, JSZip PPTX/XLSX, Tesseract OCR)
  ├─ Workspace Navigation: Review Studio, Knowledge Base, Audit Log, Brand Settings
  └─ REST APIs (Next.js 16 App Router)
       ├─ /api/organizations  -> Tenant onboarding & membership query
       ├─ /api/sources        -> Knowledge source registration & retrieval
       ├─ /api/drafts         -> Content drafting & SHA-256 fingerprinting
       ├─ /api/reviews        -> Deterministic review engine orchestration
       ├─ /api/decisions      -> Approval workflow & version integrity gate
       ├─ /api/audit          -> Tenant-partitioned audit log queries
       └─ /api/assets         -> Multimodal brand asset registry
            │
            ├─ PostgreSQL 17 (Supabase Pooler) + Row Level Security (RLS)
            └─ Pure Review Engine (src/lib/onbrand.ts)
                 ├─ Topic-gated lexical & character-trigram fact matching
                 ├─ Authority & version precedence resolution
                 ├─ Statutory rules (FDA 21 CFR 101.60, FTC Endorsement Guides)
                 ├─ Citation verification (C1–C4)
                 └─ Optional Two-Pass Semantic Verifier (C5)
```

For comprehensive architectural design, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 4. Technology Stack

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16 (App Router), React 19, TypeScript | Server and client-rendered interactive workspace |
| **Styling & UI** | Tailwind CSS, Radix UI, Accessible Custom Modals | Responsive, high-contrast, accessible interface |
| **Database & Auth** | Supabase (PostgreSQL 17, GoTrue Auth, PgBouncer) | Multi-tenant persistent storage with RLS policies |
| **Database ORM** | Drizzle ORM | Type-safe schema definitions and relational queries |
| **Review Engine** | Deterministic TypeScript Core (`src/lib/onbrand.ts`) | Reproducible claim extraction, fact matching, and citation checks |
| **Document Parsers** | Mammoth.js, JSZip, PDF.js, PapaParse, Tesseract.js | In-browser file parsing and client-side OCR |
| **Testing Framework** | Vitest, Playwright | 259 unit/integration tests and visual browser E2E automation |
| **Deployment** | Vercel Serverless Edge | Production hosting with custom domain and TLS |

---

## 5. Getting Started & Running Locally

### Prerequisites
- Node.js 22.x or 24.x
- npm 10.x or higher

### 1. Clone the Repository
```bash
git clone https://github.com/Aanchalsharma923/OnBrand.git
cd OnBrand
git checkout round3-dev
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Configure your Supabase database and authentication credentials:
```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgres://postgres.your-project:password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgres://postgres:password@db.your-project.supabase.co:5432/postgres
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
*(Reviews operate in full deterministic mode by default. To enable optional hosted model verification, add `OPENAI_API_KEY` and set `ENABLE_HOSTED_MODEL=true`.)*

### 4. Database Setup & Migrations
Apply the PostgreSQL migrations in order:
```bash
node scripts/migrate-database.mjs
```
*(Or execute `db/0001_initial.sql`, `db/0002_seed.sql`, and `db/0003_multimodal_workspace.sql` in your Supabase SQL Editor.)*

### 5. Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 6. Running Tests & Quality Verification

### Run Automated Unit & Integration Suite
```bash
npm test
```
*Executes all 30 test files and 259 tests across unit, integration, database, security, and ablation suites.*

### Run Frozen Accuracy Benchmark
```bash
npx vitest run src/eval/accuracy-benchmark.test.ts
```

### Run Release Acceptance Audit against Production
```bash
npx tsx scripts/release-acceptance-audit.mjs
```

### Run Adversarial Integrity & Tenant Isolation Audit
```bash
npx tsx scripts/phase4-phase5-audit.mjs
```

### Run Playwright Browser Automation Journey
```bash
node scripts/browser-e2e-journey.mjs
```
*Captures 10 visual milestone screenshots in `tests/screenshots/`.*

### TypeScript Compile & Lint
```bash
npx tsc --noEmit
npm run lint
```

---

## 7. Project Documentation Index

- [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md): Problem definition, target customer personas, and core product workflows.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): Deep-dive system topology, relational schema, RLS policies, and pipeline design.
- [`docs/SECURITY.md`](docs/SECURITY.md): Threat modeling, RBAC permission matrix, session management, and secret sanitization.
- [`docs/EVALUATION.md`](docs/EVALUATION.md): Benchmark results (52-passage frozen set, 10-industry evaluation, 4-condition ablation study).
- [`docs/KNOWN_LIMITATIONS.md`](docs/KNOWN_LIMITATIONS.md): Transparent boundaries regarding model gateways, document parsers, and deployment prerequisites.
- [`db/README.md`](db/README.md): Database migration documentation and PostgreSQL setup instructions.

---

## 8. License

This project is released under the MIT License. See [LICENSE](LICENSE) for details.
