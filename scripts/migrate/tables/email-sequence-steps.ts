/**
 * Migration config: Convex `emailSequenceSteps` → PostgreSQL `email_sequence_steps`
 *
 * Depends on: email_sequences (sequence_id), organizations,
 *             email_templates (template_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailSequenceStepsConfig: TableMigrationConfig = {
  sourceTable: "emailSequenceSteps",
  targetTable: "email_sequence_steps",
  fields: [
    idField(),
    refField("sequenceId", "sequence_id"),
    refField("organizationId", "organization_id"),
    field("order", "order"),
    field("delayMs", "delay_ms"),
    refField("templateId", "template_id"),
    field("conditionJson", "condition_json"),
    timestampField("createdAt", "created_at"),
  ],
};

registerTable(emailSequenceStepsConfig);

export default emailSequenceStepsConfig;
