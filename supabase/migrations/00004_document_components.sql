-- document_components — reusable blocks for document templates
-- Scope: system (built-in), org (organization-wide), user (private per author)

CREATE TABLE IF NOT EXISTS document_components (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  scope                TEXT NOT NULL CHECK (scope IN ('system', 'org', 'user')),
  created_by           TEXT REFERENCES users(id),
  name                 TEXT NOT NULL,
  description          TEXT,
  category             TEXT NOT NULL CHECK (category IN (
    'header','footer','patient_data','treatment_data',
    'signature','table','legal','custom'
  )),
  content_json         TEXT NOT NULL,
  protected            BOOLEAN NOT NULL DEFAULT FALSE,
  position_constraint  TEXT CHECK (position_constraint IN ('start', 'end')),
  version              INTEGER NOT NULL DEFAULT 1,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           BIGINT NOT NULL,
  updated_at           BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS document_components_org_idx
  ON document_components (organization_id);
CREATE INDEX IF NOT EXISTS document_components_scope_idx
  ON document_components (scope);
CREATE INDEX IF NOT EXISTS document_components_org_scope_idx
  ON document_components (organization_id, scope);
CREATE INDEX IF NOT EXISTS document_components_org_category_idx
  ON document_components (organization_id, category);
CREATE INDEX IF NOT EXISTS document_components_created_by_idx
  ON document_components (created_by);

ALTER TABLE document_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on document_components"
  ON document_components
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
