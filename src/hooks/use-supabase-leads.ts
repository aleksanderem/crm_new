/**
 * React Query hooks for fetching leads from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { Database } from "@/lib/supabase/database.types";
import {
  mapLeadFromSupabase,
  mapPipelineStageFromSupabase,
  type MappedLead,
  type MappedPipelineStage,
} from "@/lib/supabase/mappers";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type PipelineStageRow = Database["public"]["Tables"]["pipeline_stages"]["Row"];

// ---------------------------------------------------------------------------
// Leads List (paginated)
// ---------------------------------------------------------------------------

interface UseSupabaseLeadsListOptions {
  enabled?: boolean;
  limit?: number;
  search?: string;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseLeadsList(
  organizationId: string,
  options: UseSupabaseLeadsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, search, sortOrder = "desc" } = options;

  return useQuery<{ page: MappedLead[]; continueCursor: string; isDone: boolean }, Error>({
    queryKey: [...supabaseKeys.leads.list(organizationId), search ?? "", limit],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("leads")
        .select("*")
        .eq("organization_id", organizationId);

      if (search?.trim()) {
        query = query.ilike("title", `%${search.trim()}%`);
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      const page = (data ?? []).map(mapLeadFromSupabase);
      return { page, continueCursor: "", isDone: true };
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Single Lead
// ---------------------------------------------------------------------------

interface UseSupabaseLeadOptions {
  enabled?: boolean;
}

export function useSupabaseLead(
  organizationId: string,
  leadId: string | undefined,
  options: UseSupabaseLeadOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedLead | null, Error>({
    queryKey: supabaseKeys.leads.detail(organizationId, leadId ?? ""),
    queryFn: async (): Promise<MappedLead | null> => {
      if (!client || !leadId) return null;

      const { data, error } = await client
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapLeadFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!leadId,
  } satisfies UseQueryOptions<MappedLead | null, Error>);
}

// ---------------------------------------------------------------------------
// Leads grouped by pipeline stage (for kanban view)
// ---------------------------------------------------------------------------

export interface StageWithLeads extends MappedPipelineStage {
  leads: MappedLead[];
}

interface UseSupabaseLeadsByPipelineOptions {
  enabled?: boolean;
}

export function useSupabaseLeadsByPipeline(
  organizationId: string,
  pipelineId: string | undefined,
  options: UseSupabaseLeadsByPipelineOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<StageWithLeads[], Error>({
    queryKey: [...supabaseKeys.pipelineStages.list(organizationId), "withLeads", pipelineId ?? ""],
    queryFn: async (): Promise<StageWithLeads[]> => {
      if (!client || !pipelineId) return [];

      // 1. Fetch stages for this pipeline
      const stageResult = await client
        .from("pipeline_stages")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true });

      if (stageResult.error) throw stageResult.error;
      const stageRows = (stageResult.data ?? []) as PipelineStageRow[];
      if (stageRows.length === 0) return [];

      const stageIds = stageRows.map((s) => s.id);

      // 2. Fetch all leads in those stages — cast needed because .in() collapses type
      const leadResult = await client
        .from("leads")
        .select("*")
        .eq("organization_id", organizationId)
        .in("pipeline_stage_id", stageIds);

      if (leadResult.error) throw leadResult.error;
      const leadRows = (leadResult.data ?? []) as LeadRow[];

      // 3. Group leads by stage
      const leadsByStage = new Map<string, MappedLead[]>();
      for (const row of leadRows ?? []) {
        const mapped = mapLeadFromSupabase(row);
        const stageId = row.pipeline_stage_id;
        if (stageId) {
          if (!leadsByStage.has(stageId)) leadsByStage.set(stageId, []);
          leadsByStage.get(stageId)!.push(mapped);
        }
      }

      // Sort leads within each stage by stageOrder
      for (const leads of leadsByStage.values()) {
        leads.sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0));
      }

      // 4. Combine stages with their leads
      return stageRows.map((row) => ({
        ...mapPipelineStageFromSupabase(row),
        leads: leadsByStage.get(row.id) ?? [],
      }));
    },
    enabled: enabled && isReady && !!organizationId && !!pipelineId,
  });
}
