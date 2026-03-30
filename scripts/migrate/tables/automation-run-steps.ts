/**
 * Migration config: Convex `automationRunSteps` → PostgreSQL `automation_run_steps`
 *
 * Depends on: organizations (organization_id), automation_runs (run_id),
 *             automation_rules (rule_id), email_event_log (email_event_log_id)
 *
 * Note: appointment_sms_event_id references appointment_sms_events (Gabinet table)
 *       which may not exist yet in the migration target — uses plain field() not refField().
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const automationRunStepsConfig: TableMigrationConfig = {
  sourceTable: "automationRunSteps",
  targetTable: "automation_run_steps",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("runId", "run_id"),
    refField("ruleId", "rule_id"),
    field("actionIndex", "action_index"),
    field("actionType", "action_type"),
    field("idempotencyKey", "idempotency_key"),
    field("status", "status"),
    field("recipient", "recipient"),
    field("recipientName", "recipient_name"),
    field("linkedEntityType", "linked_entity_type"),
    field("linkedEntityId", "linked_entity_id"),
    field("renderedSubject", "rendered_subject"),
    field("renderedBody", "rendered_body"),
    field("metadataSnapshot", "metadata_snapshot"),
    field("errorMessage", "error_message"),
    refField("emailEventLogId", "email_event_log_id"),
    // Forward ref to Gabinet table — use plain field() per Knowledge Pattern
    field("appointmentSmsEventId", "appointment_sms_event_id"),
    timestampField("processedAt", "processed_at"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(automationRunStepsConfig);

export default automationRunStepsConfig;
