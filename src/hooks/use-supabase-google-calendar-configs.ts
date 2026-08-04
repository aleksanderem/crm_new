import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGoogleCalendarSyncConfigFromSupabase,
  type MappedGoogleCalendarSyncConfig,
} from "@/lib/supabase/mappers";

export function useSupabaseGoogleCalendarConfigs(
  organizationId: string,
  userId?: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGoogleCalendarSyncConfig[], Error>({
    queryKey: [...supabaseKeys.googleCalendarSyncConfigs.list(organizationId), userId ?? "all"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let q = client
        .from("google_calendar_sync_configs")
        .select("*")
        .eq("organization_id", organizationId);

      if (userId) {
        q = q.eq("user_id", userId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapGoogleCalendarSyncConfigFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

export function useSupabaseGoogleCalendarOrgDefault(organizationId: string) {
  const { client, isReady } = useSupabase();

  return useQuery<MappedGoogleCalendarSyncConfig | null, Error>({
    queryKey: [...supabaseKeys.googleCalendarSyncConfigs.list(organizationId), "orgDefault"],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("google_calendar_sync_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_org_default", true)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGoogleCalendarSyncConfigFromSupabase(data) : null;
    },
    enabled: isReady && !!organizationId,
  });
}
