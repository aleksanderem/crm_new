-- Index to support useSupabaseLeadsForReports date-range queries.
-- The hook filters by (organization_id, created_at) range; without this index
-- the query does a full org-scoped scan of leads which degrades at scale.
CREATE INDEX leads_org_created_at_idx ON leads (organization_id, created_at);
