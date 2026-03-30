/**
 * Migration config: Convex `emailLayouts` → PostgreSQL `email_layouts`
 *
 * Depends on: organizations, users (updated_by)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailLayoutsConfig: TableMigrationConfig = {
  sourceTable: "emailLayouts",
  targetTable: "email_layouts",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("headerBlocks", "header_blocks"),
    field("footerBlocks", "footer_blocks"),
    field("backgroundColor", "background_color"),
    field("contentBackgroundColor", "content_background_color"),
    field("primaryColor", "primary_color"),
    field("logoUrl", "logo_url"),
    field("companyName", "company_name"),
    field("footerText", "footer_text"),
    refField("updatedBy", "updated_by"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailLayoutsConfig);

export default emailLayoutsConfig;
