-- OnBrand demo schema. Apply to a PostgreSQL database before setting DATABASE_URL.
-- The server must set app.organization_id, app.user_id and app.role from a verified session
-- inside each transaction. Client-provided role values must never be trusted.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug varchar(80) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('creator','reviewer','maintainer')),
  display_name text NOT NULL,
  PRIMARY KEY (organization_id, user_id)
);
CREATE TABLE IF NOT EXISTS sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  title text NOT NULL,
  kind varchar(32) NOT NULL,
  authority integer NOT NULL CHECK (authority BETWEEN 0 AND 100),
  version integer NOT NULL DEFAULT 1,
  effective_from date NOT NULL,
  effective_to date,
  revoked_at timestamptz,
  approval_state varchar(24) NOT NULL CHECK (approval_state IN ('APPROVED','PENDING_REVIEW','REVOKED')),
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  owner text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_key, version)
);
CREATE TABLE IF NOT EXISTS facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  subject text NOT NULL,
  attribute text NOT NULL,
  value text NOT NULL,
  unit text,
  statement text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  channel varchar(32) NOT NULL,
  product text NOT NULL,
  audience text NOT NULL,
  publication_date date NOT NULL,
  current_version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS draft_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content text NOT NULL,
  content_hash varchar(64) NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, draft_id, version)
);
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  draft_version_id uuid NOT NULL REFERENCES draft_versions(id) ON DELETE CASCADE,
  draft_hash varchar(64) NOT NULL,
  source_snapshot_hash varchar(64) NOT NULL,
  status varchar(32) NOT NULL,
  model_provider text,
  model_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  claim_text text NOT NULL,
  start_offset integer NOT NULL,
  end_offset integer NOT NULL,
  category varchar(40) NOT NULL,
  evidence_status varchar(40) NOT NULL,
  severity varchar(16) NOT NULL,
  blocking_for_review boolean NOT NULL,
  explanation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestion text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  author_id text NOT NULL,
  body text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  draft_hash varchar(64) NOT NULL,
  source_snapshot_hash varchar(64) NOT NULL,
  decision varchar(32) NOT NULL CHECK (decision IN ('APPROVED','CHANGES_REQUESTED','REJECTED')),
  decided_by text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS facts_search_idx ON facts USING gin (to_tsvector('simple', statement));
CREATE INDEX IF NOT EXISTS facts_trigram_idx ON facts USING gin (statement gin_trgm_ops);
CREATE INDEX IF NOT EXISTS sources_scope_idx ON sources (organization_id, approval_state, effective_from, authority DESC);
CREATE INDEX IF NOT EXISTS drafts_org_updated_idx ON drafts (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS reviews_draft_idx ON reviews (organization_id, draft_id, created_at DESC);

CREATE OR REPLACE FUNCTION onbrand_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION onbrand_role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('app.role', true), ''), 'none')
$$;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_scope ON organizations USING (id = onbrand_org_id()) WITH CHECK (id = onbrand_org_id());
CREATE POLICY membership_scope ON memberships USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id());
CREATE POLICY sources_scope ON sources USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() = 'maintainer');
CREATE POLICY facts_scope ON facts USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() = 'maintainer');
CREATE POLICY drafts_scope ON drafts USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() IN ('creator','reviewer','maintainer'));
CREATE POLICY draft_versions_scope ON draft_versions USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() IN ('creator','reviewer','maintainer'));
CREATE POLICY reviews_scope ON reviews USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() IN ('creator','reviewer','maintainer'));
CREATE POLICY findings_scope ON findings USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() IN ('creator','reviewer','maintainer'));
CREATE POLICY comments_scope ON comments USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() IN ('creator','reviewer','maintainer'));
CREATE POLICY decisions_scope ON decisions USING (organization_id = onbrand_org_id() AND onbrand_role() IN ('reviewer','maintainer')) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() IN ('reviewer','maintainer'));
CREATE POLICY audit_events_scope ON audit_events USING (organization_id = onbrand_org_id()) WITH CHECK (organization_id = onbrand_org_id() AND onbrand_role() IN ('creator','reviewer','maintainer'));
