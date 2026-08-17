-- Add isOrgRequired flag to form_templates (closes #5290).
-- Marks a document template as mandatory at the organization level,
-- independent of any specific treatment. Defaults to false so all
-- existing templates are unaffected.

ALTER TABLE form_templates
  ADD COLUMN is_org_required BOOLEAN NOT NULL DEFAULT false;
