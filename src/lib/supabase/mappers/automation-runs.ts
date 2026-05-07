/**
 * Automation Runs Mapper — Supabase ↔ Frontend
 *
 * Maps automation_runs table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'automationRuns'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type AutomationRunRow = Database["public"]["Tables"]["automation_runs"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'automationRuns'>` from Convex (camelCase). */
export interface MappedAutomationRun {
  _id: string;
  _creationTime: number;
  organizationId: string;
  ruleId?: string;
  module: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  eventIdempotencyKey: string;
  correlationKey?: string;
  payloadSnapshot: string;
  actorUserId?: string;
  status: string;
  errorMessage?: string;
  occurredAt: number;
  processedAt?: number;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const automationRunMapper = createEntityMapper<AutomationRunRow, MappedAutomationRun>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapAutomationRunFromSupabase(row: AutomationRunRow): MappedAutomationRun {
  const mapped = automationRunMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapAutomationRunToSupabase(
  run: Record<string, unknown>,
): Record<string, unknown> {
  return automationRunMapper.mapToSupabase(run);
}
