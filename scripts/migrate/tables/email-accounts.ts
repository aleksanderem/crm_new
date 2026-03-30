/**
 * Migration config: Convex `emailAccounts` → PostgreSQL `email_accounts`
 *
 * Depends on: organizations
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailAccountsConfig: TableMigrationConfig = {
  sourceTable: "emailAccounts",
  targetTable: "email_accounts",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("fromName", "from_name"),
    field("fromEmail", "from_email"),
    field("isDefault", "is_default"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailAccountsConfig);

export default emailAccountsConfig;
