/**
 * Migration config: Convex `emailEventLog` → PostgreSQL `email_event_log`
 *
 * Depends on: organizations, email_event_bindings (binding_id),
 *             email_templates (template_id), users (triggered_by)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailEventLogConfig: TableMigrationConfig = {
  sourceTable: "emailEventLog",
  targetTable: "email_event_log",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("eventType", "event_type"),
    refField("bindingId", "binding_id"),
    refField("templateId", "template_id"),
    field("recipientEmail", "recipient_email"),
    field("recipientName", "recipient_name"),
    field("status", "status"),
    field("payload", "payload"),
    field("source", "source"),
    field("relatedEntityType", "related_entity_type"),
    field("relatedEntityId", "related_entity_id"),
    field("idempotencyKey", "idempotency_key"),
    field("renderedSubject", "rendered_subject"),
    field("renderedBody", "rendered_body"),
    field("errorMessage", "error_message"),
    refField("triggeredBy", "triggered_by"),
    timestampField("processedAt", "processed_at"),
    timestampField("createdAt", "created_at"),
  ],
};

registerTable(emailEventLogConfig);

export default emailEventLogConfig;
