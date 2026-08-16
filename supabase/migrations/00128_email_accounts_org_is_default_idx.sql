CREATE INDEX IF NOT EXISTS email_accounts_org_is_default_idx
  ON email_accounts (organization_id, is_default);
