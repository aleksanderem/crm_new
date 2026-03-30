/**
 * React Query hooks for fetching email sequences from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapEmailSequenceFromSupabase,
  type MappedEmailSequence,
  mapEmailSequenceStepFromSupabase,
  type MappedEmailSequenceStep,
} from "@/lib/supabase/mappers";

// ── List ──────────────────────────────────────────────────────────────────────

export function useSupabaseEmailSequencesList(
  organizationId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedEmailSequence[], Error>({
    queryKey: supabaseKeys.emailSequences.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_sequences")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapEmailSequenceFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function useSupabaseEmailSequence(
  organizationId: string,
  sequenceId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedEmailSequence | null, Error>({
    queryKey: supabaseKeys.emailSequences.detail(organizationId, sequenceId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_sequences")
        .select("*")
        .eq("id", sequenceId)
        .eq("organization_id", organizationId)
        .single();

      if (error) throw error;
      return data ? mapEmailSequenceFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!sequenceId,
  });
}

// ── Steps ────────────────────────────────────────────────────────────────────

export function useSupabaseEmailSequenceSteps(
  organizationId: string,
  sequenceId: string,
  options?: { enabled?: boolean },
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedEmailSequenceStep[], Error>({
    queryKey: supabaseKeys.emailSequenceSteps.detail(organizationId, sequenceId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_sequence_steps")
        .select("*")
        .eq("sequence_id", sequenceId)
        .eq("organization_id", organizationId)
        .order("order", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapEmailSequenceStepFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!sequenceId,
  });
}
