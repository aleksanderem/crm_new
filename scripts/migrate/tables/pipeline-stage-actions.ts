/**
 * Migration config: Convex `pipelineStageActions` → PostgreSQL `pipeline_stage_actions`
 *
 * Depends on: pipeline_stages (stage_id), organizations (organization_id)
 */

import {
  idField,
  refField,
  field,
  jsonbField,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const pipelineStageActionsConfig: TableMigrationConfig = {
  sourceTable: "pipelineStageActions",
  targetTable: "pipeline_stage_actions",
  fields: [
    idField(),
    refField("organizationId", "organization_id"),
    refField("stageId", "stage_id"),
    field("actionType", "action_type"),
    jsonbField("config", "config"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(pipelineStageActionsConfig);

export default pipelineStageActionsConfig;
