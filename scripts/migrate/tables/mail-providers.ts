/**
 * Migration config: Convex `mailProviders` → PostgreSQL `mail_providers`
 *
 * Depends on: organizations, users (connected_by)
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

const mailProvidersConfig: TableMigrationConfig = {
  sourceTable: "mailProviders",
  targetTable: "mail_providers",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("providerType", "provider_type"),
    jsonbField("oauthTokens", "oauth_tokens"),
    jsonbField("apiConfig", "api_config"),
    field("fromName", "from_name"),
    field("fromEmail", "from_email"),
    field("replyToEmail", "reply_to_email"),
    jsonbField("capabilities", "capabilities"),
    field("isDefault", "is_default"),
    field("isShared", "is_shared"),
    arrayField("assignedUserIds", "assigned_user_ids"),
    field("status", "status"),
    timestampField("lastSyncAt", "last_sync_at"),
    field("lastError", "last_error"),
    field("statusMessage", "status_message"),
    refField("connectedBy", "connected_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(mailProvidersConfig);

export default mailProvidersConfig;
