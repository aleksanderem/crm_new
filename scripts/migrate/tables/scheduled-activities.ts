/**
 * Migration config: Convex `scheduledActivities` → PostgreSQL `scheduled_activities`
 *
 * Depends on: organizations, users (owner_id, resource_id, created_by),
 *             google_calendar_sync_configs (sync_config_id),
 *             tag_definitions, category_definitions
 */

import {
  idField,
  refField,
  field,
  arrayField,
  jsonbField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const scheduledActivitiesConfig: TableMigrationConfig = {
  sourceTable: "scheduledActivities",
  targetTable: "scheduled_activities",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("title", "title"),
    field("activityType", "activity_type"),
    timestampField("dueDate", "due_date"),
    timestampField("endDate", "end_date"),
    field("isCompleted", "is_completed"),
    timestampField("completedAt", "completed_at"),
    refField("ownerId", "owner_id"),
    field("description", "description"),
    field("linkedEntityType", "linked_entity_type"),
    field("linkedEntityId", "linked_entity_id"),
    field("location", "location"),
    field("meetingUrl", "meeting_url"),
    field("googleEventId", "google_event_id"),
    field("googleCalendarId", "google_calendar_id"),
    timestampField("lastGoogleSyncAt", "last_google_sync_at"),
    field("requiresCompletion", "requires_completion"),
    field("sourceType", "source_type"),
    refField("syncConfigId", "sync_config_id"),
    field("visibilityOverride", "visibility_override"),
    jsonbField("moduleRef", "module_ref"),
    refField("resourceId", "resource_id"),
    arrayField("tagIds", "tag_ids"),
    refField("categoryId", "category_id"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(scheduledActivitiesConfig);

export default scheduledActivitiesConfig;
