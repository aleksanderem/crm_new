/**
 * Migration config: Convex `automationRuns` → PostgreSQL `automation_runs`
 *
 * Depends on: organizations (organization_id), automation_rules (rule_id),
 *             users (actor_user_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const automationRunsConfig: TableMigrationConfig = {
  sourceTable: "automationRuns",
  targetTable: "automation_runs",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("ruleId", "rule_id"),
    field("module", "module"),
    field("eventType", "event_type"),
    field("entityType", "entity_type"),
    field("entityId", "entity_id"),
    field("eventIdempotencyKey", "event_idempotency_key"),
    field("correlationKey", "correlation_key"),
    field("payloadSnapshot", "payload_snapshot"),
    refField("actorUserId", "actor_user_id"),
    field("status", "status"),
    field("errorMessage", "error_message"),
    timestampField("occurredAt", "occurred_at"),
    timestampField("processedAt", "processed_at"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(automationRunsConfig);

export default automationRunsConfig;
