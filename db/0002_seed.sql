-- OnBrand Seed Data for PostgreSQL / Supabase
-- Populates initial enterprise organizations, memberships, and canonical brand knowledge.

-- 1. Insert Default Organizations
INSERT INTO organizations (id, name, slug)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'OnBrand Enterprise · Acme Foods', 'acme-foods'),
  ('00000000-0000-0000-0000-000000000002', 'OnBrand Enterprise · Nova Biopharma', 'nova-biopharma')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug;

-- 2. Insert Default Memberships for Acme Foods
INSERT INTO memberships (organization_id, user_id, role, display_name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'user-alpha-creator', 'creator', 'Content Creator'),
  ('00000000-0000-0000-0000-000000000001', 'user-alpha-reviewer', 'reviewer', 'Workspace Reviewer'),
  ('00000000-0000-0000-0000-000000000001', 'user-alpha-maintainer', 'maintainer', 'Knowledge Maintainer')
ON CONFLICT (organization_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;

-- 3. Insert Default Memberships for Nova Biopharma
INSERT INTO memberships (organization_id, user_id, role, display_name)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'user-beta-creator', 'creator', 'Nova Biopharma (creator)'),
  ('00000000-0000-0000-0000-000000000002', 'user-beta-reviewer', 'reviewer', 'Nova Biopharma (reviewer)'),
  ('00000000-0000-0000-0000-000000000002', 'user-beta-maintainer', 'maintainer', 'Nova Biopharma (maintainer)')
ON CONFLICT (organization_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name;

-- 4. Canonical Knowledge Sources for Acme Foods
INSERT INTO sources (id, organization_id, source_key, title, kind, authority, version, effective_from, approval_state, owner, channels)
VALUES
  ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'SRC-PRODUCT', 'Sample Foods product specification', 'PRODUCT_FACT', 100, 1, '2025-01-01', 'APPROVED', 'Product team', '["packaging", "web", "social"]'::jsonb),
  ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'SRC-CLAIMS', 'Approved product claims register', 'APPROVED_CLAIM', 90, 1, '2025-01-01', 'APPROVED', 'Brand and legal', '["packaging", "web", "social", "email"]'::jsonb),
  ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'SRC-VOICE', 'Brand voice and identity guide', 'GUIDELINE', 80, 1, '2025-01-01', 'APPROVED', 'Brand team', '["packaging", "web", "social", "email"]'::jsonb),
  ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'SRC-DISCLOSURE', 'Channel disclosure requirements', 'DISCLOSURE', 85, 1, '2025-01-01', 'APPROVED', 'Compliance reviewer', '["web", "social", "email"]'::jsonb)
ON CONFLICT (organization_id, source_key, version) DO UPDATE SET
  title = EXCLUDED.title,
  approval_state = EXCLUDED.approval_state;

-- 5. Canonical Facts for Product Specification
INSERT INTO facts (organization_id, source_id, subject, attribute, value, unit, statement)
VALUES
  ('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Sample Foods Oat Bites', 'protein per serving', '6', 'g', 'Sample Foods Oat Bites contains 6 g protein per serving.'),
  ('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Sample Foods Oat Bites', 'added sugar per serving', '4', 'g', 'Sample Foods Oat Bites contains 4 g added sugar per serving.'),
  ('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Sample Foods Oat Bites', 'serving size', '30', 'g', 'Sample Foods Oat Bites serving size is 30 g.'),
  ('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Sample Foods Oat Bites', 'allergen', 'contains oats', '', 'Sample Foods Oat Bites contains oats.'),
  ('00000000-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Sample Foods Oat Bites', 'allergen', 'may contain peanuts', '', 'Sample Foods Oat Bites may contain peanuts.')
ON CONFLICT DO NOTHING;

