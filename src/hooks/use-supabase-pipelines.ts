/**
 * React Query hooks for fetching pipelines, stages, and stage actions from Supabase.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapPipelineFromSupabase,
  mapPipelineStageFromSupabase,
  mapPipelineStageActionFromSupabase,
  type MappedPipeline,
  type MappedPipelineStage,
  type MappedPipelineStageAction,
} from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Pipelines List
// ---------------------------------------------------------------------------

interface UseSupabasePipelinesListOptions {
  enabled?: boolean;
}

export function useSupabasePipelinesList(
  organizationId: string,
  options: UseSupabasePipelinesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedPipeline[], Error>({
    queryKey: supabaseKeys.pipelines.list(organizationId),
    queryFn: async (): Promise<MappedPipeline[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("pipelines")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapPipelineFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedPipeline[], Error>);
}

// ---------------------------------------------------------------------------
// Pipeline Stages (for a specific pipeline)
// ---------------------------------------------------------------------------

interface UseSupabasePipelineStagesOptions {
  enabled?: boolean;
}

export function useSupabasePipelineStages(
  organizationId: string,
  pipelineId: string | undefined,
  options: UseSupabasePipelineStagesOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedPipelineStage[], Error>({
    queryKey: [...supabaseKeys.pipelineStages.list(organizationId), pipelineId ?? ""],
    queryFn: async (): Promise<MappedPipelineStage[]> => {
      if (!client || !pipelineId) return [];

      const { data, error } = await client
        .from("pipeline_stages")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapPipelineStageFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!pipelineId,
  } satisfies UseQueryOptions<MappedPipelineStage[], Error>);
}

// ---------------------------------------------------------------------------
// All Pipeline Stages (across all pipelines)
// ---------------------------------------------------------------------------

interface UseSupabaseAllPipelineStagesOptions {
  enabled?: boolean;
}

export function useSupabaseAllPipelineStages(
  organizationId: string,
  options: UseSupabaseAllPipelineStagesOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedPipelineStage[], Error>({
    queryKey: [...supabaseKeys.pipelineStages.list(organizationId), "all"],
    queryFn: async (): Promise<MappedPipelineStage[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("pipeline_stages")
        .select("*")
        .eq("organization_id", organizationId)
        .order("order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapPipelineStageFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedPipelineStage[], Error>);
}

// ---------------------------------------------------------------------------
// Pipeline Stage Actions
// ---------------------------------------------------------------------------

interface UseSupabasePipelineStageActionsOptions {
  enabled?: boolean;
}

export function useSupabasePipelineStageActions(
  organizationId: string,
  stageId: string | undefined,
  options: UseSupabasePipelineStageActionsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedPipelineStageAction[], Error>({
    queryKey: [...supabaseKeys.pipelineStageActions.list(organizationId), stageId ?? ""],
    queryFn: async (): Promise<MappedPipelineStageAction[]> => {
      if (!client || !stageId) return [];

      const { data, error } = await client
        .from("pipeline_stage_actions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("stage_id", stageId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapPipelineStageActionFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!stageId,
  } satisfies UseQueryOptions<MappedPipelineStageAction[], Error>);
}
