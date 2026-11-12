-- OnBrand Multimodal Interactive Content Review Workspace
-- Migration 0003: Ingestion, Extracted Structural Entities, Annotations, Media Frames, Transcripts & Revisions

CREATE TABLE IF NOT EXISTS content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime_type varchar(120) NOT NULL,
  size_bytes bigint NOT NULL,
  content_hash varchar(64) NOT NULL,
  storage_ref text NOT NULL,
  processing_status varchar(32) NOT NULL DEFAULT 'PENDING' CHECK (processing_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  extraction_status varchar(32) NOT NULL DEFAULT 'DIRECT' CHECK (extraction_status IN ('RELIABLE', 'NEEDS_PROOFREAD', 'UNREADABLE', 'DIRECT', 'FAILED')),
  quality_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_text text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  job_type varchar(32) NOT NULL CHECK (job_type IN ('OCR', 'VIDEO_SAMPLING', 'AUDIO_TRANSCRIPTION', 'VISUAL_AUDIT')),
  status varchar(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extracted_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  text text NOT NULL,
  word_boxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, page_number)
);

CREATE TABLE IF NOT EXISTS extracted_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  block_type varchar(32) NOT NULL, -- paragraph, heading, table, slide, cell
  block_index integer NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  frame_index integer NOT NULL,
  timestamp_seconds numeric(8, 2) NOT NULL,
  ocr_text text,
  word_boxes jsonb NOT NULL DEFAULT '[]'::jsonb,
  dominant_colors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, frame_index)
);

CREATE TABLE IF NOT EXISTS transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  duration_seconds numeric(8, 2) NOT NULL,
  language varchar(10) NOT NULL DEFAULT 'en',
  full_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transcript_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  start_seconds numeric(8, 2) NOT NULL,
  end_seconds numeric(8, 2) NOT NULL,
  speaker text,
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  finding_id text NOT NULL,
  location_type varchar(40) NOT NULL,
  category varchar(40) NOT NULL,
  severity varchar(16) NOT NULL,
  evidence_status varchar(40) NOT NULL,
  is_actionable boolean NOT NULL DEFAULT true,
  coordinates jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_text text NOT NULL,
  explanation text NOT NULL,
  suggested_correction text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS editable_representations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  format varchar(32) NOT NULL,
  content text NOT NULL,
  structural_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exported_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  version integer NOT NULL,
  format varchar(32) NOT NULL,
  download_url text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS for all new tables
ALTER TABLE content_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE editable_representations ENABLE ROW LEVEL SECURITY;
ALTER TABLE exported_revisions ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation RLS Policies
CREATE POLICY content_assets_tenant_isolation ON content_assets FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY processing_jobs_tenant_isolation ON processing_jobs FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY extracted_pages_tenant_isolation ON extracted_pages FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY extracted_blocks_tenant_isolation ON extracted_blocks FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY media_frames_tenant_isolation ON media_frames FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY transcripts_tenant_isolation ON transcripts FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY transcript_segments_tenant_isolation ON transcript_segments FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY annotations_tenant_isolation ON annotations FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY editable_representations_tenant_isolation ON editable_representations FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE POLICY exported_revisions_tenant_isolation ON exported_revisions FOR ALL
  USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

