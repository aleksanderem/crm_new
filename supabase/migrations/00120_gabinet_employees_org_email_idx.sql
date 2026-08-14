-- Issue #4764: add (organization_id, email) index on gabinet_employees.
-- _createFromInvitation and createWithPassword both do
-- eq("organizationId", ...).eq("email", ...) to find pre-created employee
-- rows; without this index those queries do a sequential scan within the org.

CREATE INDEX IF NOT EXISTS gabinet_employees_org_email_idx
  ON gabinet_employees (organization_id, email);
