/**
 * Migration config: Convex `orgSettings` → PostgreSQL `org_settings`
 *
 * Depends on: organizations (organization_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const orgSettingsConfig: TableMigrationConfig = {
  sourceTable: "orgSettings",
  targetTable: "org_settings",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("allowCustomLostReason", "allow_custom_lost_reason"),
    field("lostReasonRequired", "lost_reason_required"),
    field("defaultCurrency", "default_currency"),
    field("timezone", "timezone"),
    field("resourceSharingEnabled", "resource_sharing_enabled"),
    field("reminderEnabled", "reminder_enabled"),
    field("reminderHoursBefore", "reminder_hours_before"),
    field("appointmentWorkflowConfig", "appointment_workflow_config"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(orgSettingsConfig);

export default orgSettingsConfig;
