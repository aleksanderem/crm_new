-- Generic AI document-analysis jobs (spec 2026-07-16). Stores request pages,
-- status and result for analysis kinds without a natural host row.
-- Timestamps are BIGINT ms-epoch, PK is TEXT (project convention).

CREATE TABLE IF NOT EXISTS document_analysis_jobs (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,
  pages           JSONB NOT NULL,
  context         TEXT,
  status          TEXT NOT NULL CHECK (status IN ('pending','running','ok','error')),
  result_json     TEXT,
  error_message   TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id),
  created_at      BIGINT NOT NULL,
  updated_at      BIGINT NOT NULL,
  completed_at    BIGINT
);

CREATE INDEX IF NOT EXISTS document_analysis_jobs_org_idx
  ON document_analysis_jobs (organization_id);
CREATE INDEX IF NOT EXISTS document_analysis_jobs_org_kind_idx
  ON document_analysis_jobs (organization_id, kind);

ALTER TABLE document_analysis_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_analysis_jobs_select ON document_analysis_jobs
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY document_analysis_jobs_insert ON document_analysis_jobs
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_analysis_jobs_update ON document_analysis_jobs
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY document_analysis_jobs_delete ON document_analysis_jobs
  FOR DELETE USING (current_org_id() = organization_id);
