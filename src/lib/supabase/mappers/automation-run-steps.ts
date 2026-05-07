/**
 * Automation Run Steps Mapper — Supabase ↔ Frontend
 *
 * Maps automation_run_steps table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'automationRunSteps'>` from Convex.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type AutomationRunStepRow = Database["public"]["Tables"]["automation_run_steps"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'automationRunSteps'>` from Convex (camelCase). */
export interface MappedAutomationRunStep {
  _id: string;
  _creationTime: number;
  organizationId: string;
  runId: string;
  ruleId?: string;
  actionIndex: number;
  actionType: string;
  idempotencyKey: string;
  status: string;
  recipient?: string;
  recipientName?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  renderedSubject?: string;
  renderedBody?: string;
  metadataSnapshot?: string;
  errorMessage?: string;
  emailEventLogId?: string;
  appointmentSmsEventId?: string;
  processedAt?: number;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const automationRunStepMapper = createEntityMapper<AutomationRunStepRow, MappedAutomationRunStep>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapAutomationRunStepFromSupabase(row: AutomationRunStepRow): MappedAutomationRunStep {
  const mapped = automationRunStepMapper.mapFromSupabase(row);
  return { ...mapped, _creationTime: mapped.createdAt };
}

export function mapAutomationRunStepToSupabase(
  step: Record<string, unknown>,
): Record<string, unknown> {
  return automationRunStepMapper.mapToSupabase(step);
}
