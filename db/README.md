# OnBrand — Database Migrations & PostgreSQL Schema

## 1. Migration Overview

The database layer is built on PostgreSQL 17 (managed via Supabase). Database migrations are stored in sequential SQL files:

| Migration File | Description | Objects Created |
| :--- | :--- | :--- |
| [`0001_initial.sql`](0001_initial.sql) | Baseline multi-tenant schema, organizations, memberships, drafts, sources, reviews, decisions, and RLS policies. | `organizations`, `memberships`, `sources`, `source_facts`, `drafts`, `reviews`, `decisions`, `audit_events`, RLS policies, indexes. |
| [`0002_seed.sql`](0002_seed.sql) | Seed fixtures for enterprise demonstration tenant (Acme Foods · `org_alpha`). | Verified demo sources, product fact sheets, approved packaging guidelines, and statutory rules. |
| [`0003_multimodal_workspace.sql`](0003_multimodal_workspace.sql) | Multimodal brand asset tables and enhanced perceptual hash indexing. | `brand_assets`, `visual_guidelines`, perceptual hash triggers, composite tenant indexes. |

---

## 2. Applying Migrations to a Fresh Database

To initialize a new Supabase or PostgreSQL 17 instance:

### Option A: Using the Migration Script
Ensure `DATABASE_URL` is set in your environment:
```bash
node scripts/migrate-database.mjs
```

### Option B: Direct Execution via Supabase SQL Editor / psql
Apply the files in exact sequential order:
```bash
# Connect to direct connection pool (port 5432) or via psql
psql "$DIRECT_URL" -f db/0001_initial.sql
psql "$DIRECT_URL" -f db/0002_seed.sql
psql "$DIRECT_URL" -f db/0003_multimodal_workspace.sql
```

---

## 3. Schema & Row Level Security (RLS) Verification

Every tenant-owned table enables Row Level Security:
- `ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;`
- `ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;`

Policies verify that the executing user belongs to the matching `organization_id`:
```sql
CREATE POLICY "tenant_isolation_sources_select" ON public.sources
  FOR SELECT TO authenticated
  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid);
```

### Automated Verification
Run the automated database integration and security test suite:
```bash
npm test src/lib/server/database-integration.test.ts
npm test src/lib/server/tenant-isolation.test.ts
```
