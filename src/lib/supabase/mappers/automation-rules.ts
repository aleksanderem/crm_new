/**
 * Automation Rules Mapper — Supabase ↔ Frontend
 *
 * Maps automation_rules table rows to camelCase frontend objects using the generic
 * createEntityMapper factory. Shape mirrors `Doc<'automationRules'>` from Convex.
 *
 * JSONB columns (trigger, graph, conditions, actions) are passed through as
 * `unknown` — consumers cast at usage point per Knowledge Pattern #14.
 */

import type { Database } from "../database.types";
import { createEntityMapper } from "./generic";

type AutomationRuleRow = Database["public"]["Tables"]["automation_rules"]["Row"];

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape that mirrors `Doc<'automationRules'>` from Convex (camelCase). */
export interface MappedAutomationRule {
  _id: string;
  organizationId: string;
  name: string;
  description?: string;
  module: string;
  eventType: string;
  entityType?: string;
  trigger: unknown;
  graph: unknown;
  definitionVersion?: number;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

// ─── Mapper Instance ──────────────────────────────────────────────────────────

const automationRuleMapper = createEntityMapper<AutomationRuleRow, MappedAutomationRule>({});

// ─── Exported Functions ───────────────────────────────────────────────────────

export function mapAutomationRuleFromSupabase(row: AutomationRuleRow): MappedAutomationRule {
  return automationRuleMapper.mapFromSupabase(row);
}

export function mapAutomationRuleToSupabase(
  rule: Record<string, unknown>,
): Record<string, unknown> {
  return automationRuleMapper.mapToSupabase(rule);
}
