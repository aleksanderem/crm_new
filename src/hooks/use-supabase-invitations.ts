/**
 * React Query hooks for fetching invitations from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapInvitationFromSupabase, type MappedInvitation } from "@/lib/supabase/mappers";

export function useSupabasePendingInvitations(organizationId: string, options?: { enabled?: boolean }) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options ?? {};

  return useQuery<MappedInvitation[], Error>({
    queryKey: [...supabaseKeys.invitations.list(organizationId), "pending"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("invitations")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapInvitationFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
