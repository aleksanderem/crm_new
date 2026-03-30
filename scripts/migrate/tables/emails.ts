/**
 * Migration config: Convex `emails` → PostgreSQL `emails`
 *
 * Depends on: organizations, email_templates (template_id),
 *             mail_providers (mail_provider_id), contacts (contact_id),
 *             companies (company_id), leads (lead_id), users (sent_by)
 *
 * Note: PostgreSQL `from` column is a reserved keyword; the framework's
 * parameterised INSERT handles quoting automatically.
 */

import {
  idField,
  refField,
  field,
  arrayField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const emailsConfig: TableMigrationConfig = {
  sourceTable: "emails",
  targetTable: "emails",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("threadId", "thread_id"),
    field("messageId", "message_id"),
    field("inReplyTo", "in_reply_to"),
    field("direction", "direction"),
    field("from", "from"),
    arrayField("to", "to"),
    arrayField("cc", "cc"),
    arrayField("bcc", "bcc"),
    field("subject", "subject"),
    field("bodyHtml", "body_html"),
    field("bodyText", "body_text"),
    field("snippet", "snippet"),
    field("isRead", "is_read"),
    field("isStarred", "is_starred"),
    refField("contactId", "contact_id"),
    refField("companyId", "company_id"),
    refField("leadId", "lead_id"),
    field("provider", "provider"),
    refField("mailProviderId", "mail_provider_id"),
    field("gmailMessageId", "gmail_message_id"),
    field("gmailThreadId", "gmail_thread_id"),
    refField("sentBy", "sent_by"),
    refField("templateId", "template_id"),
    field("patientId", "patient_id"),
    field("appointmentId", "appointment_id"),
    field("employeeId", "employee_id"),
    timestampField("sentAt", "sent_at"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(emailsConfig);

export default emailsConfig;
