/**
 * Migration config: Convex `pipelineStages` → PostgreSQL `pipeline_stages`
 *
 * Depends on: pipelines (pipeline_id), organizations (organization_id)
 */

import {
  idField,
  refField,
  field,
  timestampField,
  registerTable,
} from "../config.js";
import type { TableMigrationConfig } from "../types.js";

const pipelineStagesConfig: TableMigrationConfig = {
  sourceTable: "pipelineStages",
  targetTable: "pipeline_stages",
  fields: [
    idField(),
    refField("pipelineId", "pipeline_id"),
    refField("organizationId", "organization_id"),
    field("name", "name"),
    field("color", "color"),
    field("order", "order"),
    field("isWonStage", "is_won_stage"),
    field("isLostStage", "is_lost_stage"),
    timestampField("createdAt", "created_at"),
    timestampField("updatedAt", "updated_at"),
  ],
};

registerTable(pipelineStagesConfig);

export default pipelineStagesConfig;
