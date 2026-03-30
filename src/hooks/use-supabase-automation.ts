/**
 * React Query hooks for fetching automation rules, runs, and run steps
 * from Supabase (PostgreSQL).
 *
 * Rules hook enriches each rule with its most recent run (`lastRun`),
 * matching the shape previously returned by convexQuery(api.automation.listRules).
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapAutomationRuleFromSupabase,
  mapAutomationRunFromSupabase,
  mapAutomationRunStepFromSupabase,
  type MappedAutomationRule,
  type MappedAutomationRun,
  type MappedAutomationRunStep,
} from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Rules List (enriched with lastRun)
// ---------------------------------------------------------------------------

export type AutomationRuleWithLastRun = MappedAutomationRule & {
  lastRun: Pick<MappedAutomationRun, "status" | "createdAt" | "occurredAt"> | null;
};

interface UseSupabaseAutomationRulesListOptions {
  enabled?: boolean;
}

/**
 * Fetches automation_rules ordered by created_at desc, then enriches each rule
 * with the latest automation_run for that rule (lastRun).
 */
export function useSupabaseAutomationRulesList(
  organizationId: string,
  options: UseSupabaseAutomationRulesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<AutomationRuleWithLastRun[], Error>({
    queryKey: supabaseKeys.automationRules.list(organizationId),
    queryFn: async (): Promise<AutomationRuleWithLastRun[]> => {
      if (!client) throw new Error("Supabase client not ready");

      // Fetch rules ordered by created_at desc
      const { data: ruleRows, error: rulesError } = await client
        .from("automation_rules")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (rulesError) throw rulesError;
      if (!ruleRows || ruleRows.length === 0) return [];

      const rules = ruleRows.map(mapAutomationRuleFromSupabase);

      // Fetch latest run per rule — get recent runs ordered by created_at desc
      // and pick the first one per rule_id in JS
      const ruleIds = rules.map((r) => r._id);
      const { data: runRows, error: runsError } = await client
        .from("automation_runs")
        .select("id, rule_id, status, created_at, occurred_at")
        .eq("organization_id", organizationId)
        .in("rule_id", ruleIds)
        .order("created_at", { ascending: false });

      if (runsError) throw runsError;

      // Build a map of ruleId → latest run
      const latestRunByRule = new Map<
        string,
        { status: string; createdAt: number; occurredAt: number }
      >();
      for (const row of (runRows ?? []) as Array<{ id: string; rule_id: string | null; status: string; created_at: number; occurred_at: number }>) {
        if (row.rule_id && !latestRunByRule.has(row.rule_id)) {
          latestRunByRule.set(row.rule_id, {
            status: row.status,
            createdAt: row.created_at,
            occurredAt: row.occurred_at,
          });
        }
      }

      return rules.map((rule) => ({
        ...rule,
        lastRun: latestRunByRule.get(rule._id) ?? null,
      }));
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Runs List
// ---------------------------------------------------------------------------

interface UseSupabaseAutomationRunsListOptions {
  enabled?: boolean;
  limit?: number;
}

/**
 * Fetches automation_runs ordered by created_at desc with optional limit.
 */
export function useSupabaseAutomationRunsList(
  organizationId: string,
  options: UseSupabaseAutomationRunsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedAutomationRun[], Error>({
    queryKey: [...supabaseKeys.automationRuns.list(organizationId), limit],
    queryFn: async (): Promise<MappedAutomationRun[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("automation_runs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapAutomationRunFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Run Steps
// ---------------------------------------------------------------------------

interface UseSupabaseAutomationRunStepsOptions {
  enabled?: boolean;
}

/**
 * Fetches automation_run_steps for a specific run, ordered by action_index asc.
 */
export function useSupabaseAutomationRunSteps(
  organizationId: string,
  runId: string | undefined,
  options: UseSupabaseAutomationRunStepsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedAutomationRunStep[], Error>({
    queryKey: supabaseKeys.automationRunSteps.detail(
      organizationId,
      runId ?? "",
    ),
    queryFn: async (): Promise<MappedAutomationRunStep[]> => {
      if (!client || !runId) return [];

      const { data, error } = await client
        .from("automation_run_steps")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("run_id", runId)
        .order("action_index", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapAutomationRunStepFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!runId,
  });
}
