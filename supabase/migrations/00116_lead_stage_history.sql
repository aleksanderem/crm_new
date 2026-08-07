-- Migration 00116: Lead Stage History (closes #4289)
-- Tracks when a lead enters and exits each pipeline stage,
-- enabling "avg time per stage" funnel velocity reporting.

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id              TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id         TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL REFERENCES pipeline_stages(id),
  entered_at      BIGINT NOT NULL,
  exited_at       BIGINT
);

-- Fast lookup: all stage entries for a lead in chronological order
CREATE INDEX IF NOT EXISTS lead_stage_history_lead_idx
  ON lead_stage_history (lead_id, entered_at);

-- Aggregate queries: avg time per stage across all leads in an org
CREATE INDEX IF NOT EXISTS lead_stage_history_org_stage_idx
  ON lead_stage_history (organization_id, stage_id);

ALTER TABLE lead_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_stage_history_select ON lead_stage_history
  FOR SELECT USING (current_org_id() = organization_id);
CREATE POLICY lead_stage_history_insert ON lead_stage_history
  FOR INSERT WITH CHECK (current_org_id() = organization_id);
CREATE POLICY lead_stage_history_update ON lead_stage_history
  FOR UPDATE USING (current_org_id() = organization_id)
  WITH CHECK (current_org_id() = organization_id);
CREATE POLICY lead_stage_history_delete ON lead_stage_history
  FOR DELETE USING (current_org_id() = organization_id);
