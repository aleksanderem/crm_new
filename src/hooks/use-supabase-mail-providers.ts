/**
 * React Query hooks for fetching mail providers from Supabase (PostgreSQL).
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapMailProviderFromSupabase,
  type MappedMailProvider,
} from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Mail Providers List
// ---------------------------------------------------------------------------

interface UseSupabaseMailProvidersListOptions {
  enabled?: boolean;
}

export function useSupabaseMailProvidersList(
  organizationId: string,
  options: UseSupabaseMailProvidersListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedMailProvider[], Error>({
    queryKey: supabaseKeys.mailProviders.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("mail_providers")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapMailProviderFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Single Mail Provider
// ---------------------------------------------------------------------------

interface UseSupabaseMailProviderOptions {
  enabled?: boolean;
}

export function useSupabaseMailProvider(
  organizationId: string,
  providerId: string | undefined,
  options: UseSupabaseMailProviderOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedMailProvider | null, Error>({
    queryKey: supabaseKeys.mailProviders.detail(
      organizationId,
      providerId ?? "",
    ),
    queryFn: async (): Promise<MappedMailProvider | null> => {
      if (!client || !providerId) return null;

      const { data, error } = await client
        .from("mail_providers")
        .select("*")
        .eq("id", providerId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapMailProviderFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!providerId,
  });
}

// ---------------------------------------------------------------------------
// Default Mail Provider (convenience hook)
// ---------------------------------------------------------------------------

export function useSupabaseDefaultMailProvider(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedMailProvider | null, Error>({
    queryKey: [...supabaseKeys.mailProviders.list(organizationId), "default"],
    queryFn: async (): Promise<MappedMailProvider | null> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("mail_providers")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .maybeSingle();

      if (error) throw error;
      return data ? mapMailProviderFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
