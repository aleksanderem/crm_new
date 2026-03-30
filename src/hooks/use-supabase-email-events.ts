/**
 * React Query hooks for email event types, bindings, and event log
 * from Supabase (PostgreSQL).
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapEmailEventTypeFromSupabase,
  mapEmailEventBindingFromSupabase,
  mapEmailEventLogFromSupabase,
  type MappedEmailEventType,
  type MappedEmailEventBinding,
  type MappedEmailEventLog,
} from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Email Event Types
// ---------------------------------------------------------------------------

interface UseSupabaseEmailEventTypesOptions {
  enabled?: boolean;
}

export function useSupabaseEmailEventTypes(
  organizationId: string,
  options: UseSupabaseEmailEventTypesOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmailEventType[], Error>({
    queryKey: supabaseKeys.emailEventTypes.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_event_types")
        .select("*")
        .eq("organization_id", organizationId)
        .order("module", { ascending: true })
        .order("event_type", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapEmailEventTypeFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Email Event Bindings
// ---------------------------------------------------------------------------

interface UseSupabaseEmailEventBindingsOptions {
  enabled?: boolean;
}

export function useSupabaseEmailEventBindings(
  organizationId: string,
  options: UseSupabaseEmailEventBindingsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmailEventBinding[], Error>({
    queryKey: supabaseKeys.emailEventBindings.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_event_bindings")
        .select("*")
        .eq("organization_id", organizationId)
        .order("priority", { ascending: true });

      if (error) throw error;
      return (data ?? []).map(mapEmailEventBindingFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Email Event Log
// ---------------------------------------------------------------------------

interface UseSupabaseEmailEventLogOptions {
  enabled?: boolean;
  status?: "pending" | "sent" | "failed" | "skipped";
  limit?: number;
}

export function useSupabaseEmailEventLog(
  organizationId: string,
  options: UseSupabaseEmailEventLogOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, status, limit = 100 } = options;

  return useQuery<MappedEmailEventLog[], Error>({
    queryKey: [
      ...supabaseKeys.emailEventLog.list(organizationId),
      status ?? "all",
      limit,
    ],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("email_event_log")
        .select("*")
        .eq("organization_id", organizationId);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapEmailEventLogFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
