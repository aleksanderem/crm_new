/**
 * Migration config: Convex `emailSequenceEnrollments` → PostgreSQL `email_sequence_enrollments`
 *
 * Depends on: email_sequences (sequence_id), organizations
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailSequenceEnrollmentsConfig: TableMigrationConfig = {
  sourceTable: "emailSequenceEnrollments",
  targetTable: "email_sequence_enrollments",
  fields: [
    idField(),
    refField("sequenceId", "sequence_id"),
    refField("organizationId", "organization_id"),
    field("recipientEmail", "recipient_email"),
    field("recipientName", "recipient_name"),
    field("payload", "payload"),
    field("currentStep", "current_step"),
    field("status", "status"),
    timestampField("enrolledAt", "enrolled_at"),
    timestampField("completedAt", "completed_at"),
    timestampField("cancelledAt", "cancelled_at"),
  ],
};

registerTable(emailSequenceEnrollmentsConfig);

export default emailSequenceEnrollmentsConfig;
