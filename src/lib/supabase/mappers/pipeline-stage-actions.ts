/**
 * Pipeline Stage Actions Mapper — Supabase ↔ Frontend
 *
 * Maps pipeline_stage_actions table rows to camelCase frontend objects
 * using the generic createEntityMapper factory. The `config` field is
 * JSONB in Postgres and typed as `unknown` — preserved as-is.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type PipelineStageActionRow = Database["public"]["Tables"]["pipeline_stage_actions"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'pipelineStageActions'>` from Convex (camelCase). */
export interface MappedPipelineStageAction {
  _id: string;
  _creationTime: number;
  organizationId: string;
  stageId: string;
  actionType: string;
  config: unknown;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const pipelineStageActionMapper = createEntityMapper<
  PipelineStageActionRow,
  MappedPipelineStageAction
>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapPipelineStageActionFromSupabase(
  row: PipelineStageActionRow,
): MappedPipelineStageAction {
  const mapped = pipelineStageActionMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapPipelineStageActionToSupabase(
  action: Record<string, unknown>,
): Record<string, unknown> {
  return pipelineStageActionMapper.mapToSupabase(action);
}
