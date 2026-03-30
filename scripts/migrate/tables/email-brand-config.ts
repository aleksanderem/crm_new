/**
 * Migration config: Convex `emailBrandConfig` → PostgreSQL `email_brand_config`
 *
 * Depends on: organizations, users (created_by, updated_by)
 */

import {
  idField,
  refField,
  field,
  jsonbField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailBrandConfigConfig: TableMigrationConfig = {
  sourceTable: "emailBrandConfig",
  targetTable: "email_brand_config",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("logoStorageId", "logo_storage_id"),
    field("logoUrl", "logo_url"),
    field("companyName", "company_name"),
    field("primaryColor", "primary_color"),
    field("backgroundColor", "background_color"),
    field("contentBackgroundColor", "content_background_color"),
    field("textColor", "text_color"),
    field("secondaryTextColor", "secondary_text_color"),
    field("accentColor", "accent_color"),
    field("footerText", "footer_text"),
    jsonbField("socialLinks", "social_links"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    refField("updatedBy", "updated_by"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailBrandConfigConfig);

export default emailBrandConfigConfig;
