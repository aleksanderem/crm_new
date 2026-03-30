/**
 * Pipelines & Pipeline Stages Mapper — Supabase ↔ Frontend
 *
 * Maps pipelines and pipeline_stages table rows to camelCase frontend objects
 * using the generic createEntityMapper factory.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type PipelineRow = Database["public"]["Tables"]["pipelines"]["Row"];
type PipelineStageRow = Database["public"]["Tables"]["pipeline_stages"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'pipelines'>` from Convex (camelCase). */
export interface MappedPipeline {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  type?: string;
  isDefault?: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

/** Shape that mirrors `Doc<'pipelineStages'>` from Convex (camelCase). */
export interface MappedPipelineStage {
  _id: string;
  pipelineId: string;
  organizationId: string;
  name: string;
  color?: string;
  order: number;
  isWonStage?: boolean;
  isLostStage?: boolean;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instances ─────────────────────────────────────────────────────────

const pipelineMapper = createEntityMapper<PipelineRow, MappedPipeline>({});

const pipelineStageMapper = createEntityMapper<PipelineStageRow, MappedPipelineStage>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapPipelineFromSupabase(row: PipelineRow): MappedPipeline {
  return pipelineMapper.mapFromSupabase(row);
}

export function mapPipelineToSupabase(
  pipeline: Record<string, unknown>,
): Record<string, unknown> {
  return pipelineMapper.mapToSupabase(pipeline);
}

export function mapPipelineStageFromSupabase(row: PipelineStageRow): MappedPipelineStage {
  return pipelineStageMapper.mapFromSupabase(row);
}

export function mapPipelineStageToSupabase(
  stage: Record<string, unknown>,
): Record<string, unknown> {
  return pipelineStageMapper.mapToSupabase(stage);
}
