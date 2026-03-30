/**
 * Migration config: Convex `leads` → PostgreSQL `leads`
 *
 * Depends on: organizations, companies (company_id), users (assigned_to, created_by),
 *             pipeline_stages (pipeline_stage_id), tag_definitions, category_definitions
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

const leadsConfig: TableMigrationConfig = {
  sourceTable: "leads",
  targetTable: "leads",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    field("title", "title"),
    field("value", "value"),
    field("currency", "currency"),
    field("status", "status"),
    field("priority", "priority"),
    timestampField("expectedCloseDate", "expected_close_date"),
    field("source", "source"),
    refField("companyId", "company_id"),
    refField("assignedTo", "assigned_to"),
    refField("pipelineStageId", "pipeline_stage_id"),
    field("stageOrder", "stage_order"),
    field("notes", "notes"),
    arrayField("tags", "tags"),
    arrayField("tagIds", "tag_ids"),
    refField("categoryId", "category_id"),
    timestampField("wonAt", "won_at"),
    timestampField("lostAt", "lost_at"),
    field("lostReason", "lost_reason"),
    refField("createdBy", "created_by"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(leadsConfig);

export default leadsConfig;
