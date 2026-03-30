/**
 * React Query hooks for fetching audit log from Supabase.
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapAuditLogFromSupabase, type MappedAuditLogEntry } from "@/lib/supabase/mappers";

interface UseSupabaseAuditLogOptions {
  enabled?: boolean;
  limit?: number;
  actionFilter?: string;
  userFilter?: string;
  startDate?: number;
  endDate?: number;
}

export function useSupabaseAuditLog(
  organizationId: string,
  options: UseSupabaseAuditLogOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 50, actionFilter, userFilter, startDate, endDate } = options;

  return useQuery<MappedAuditLogEntry[], Error>({
    queryKey: [...supabaseKeys.auditLog.list(organizationId), actionFilter, userFilter, startDate, endDate],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("audit_log")
        .select("*")
        .eq("organization_id", organizationId);

      if (actionFilter) query = query.eq("action", actionFilter);
      if (userFilter) query = query.eq("user_id", userFilter);
      if (startDate) query = query.gte("created_at", startDate);
      if (endDate) query = query.lte("created_at", endDate);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapAuditLogFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
