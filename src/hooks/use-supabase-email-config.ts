/**
 * React Query hooks for email brand config, layouts, and email accounts
 * from Supabase (PostgreSQL).
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapEmailBrandConfigFromSupabase,
  mapEmailLayoutFromSupabase,
  mapEmailAccountFromSupabase,
  type MappedEmailBrandConfig,
  type MappedEmailLayout,
  type MappedEmailAccount,
} from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Email Brand Config
// ---------------------------------------------------------------------------

interface UseSupabaseEmailBrandConfigOptions {
  enabled?: boolean;
}

export function useSupabaseEmailBrandConfig(
  organizationId: string,
  options: UseSupabaseEmailBrandConfigOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmailBrandConfig | null, Error>({
    queryKey: supabaseKeys.emailBrandConfig.list(organizationId),
    queryFn: async (): Promise<MappedEmailBrandConfig | null> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_brand_config")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapEmailBrandConfigFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Email Layout
// ---------------------------------------------------------------------------

interface UseSupabaseEmailLayoutOptions {
  enabled?: boolean;
}

export function useSupabaseEmailLayout(
  organizationId: string,
  options: UseSupabaseEmailLayoutOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmailLayout | null, Error>({
    queryKey: supabaseKeys.emailLayouts.list(organizationId),
    queryFn: async (): Promise<MappedEmailLayout | null> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_layouts")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapEmailLayoutFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Email Accounts List
// ---------------------------------------------------------------------------

interface UseSupabaseEmailAccountsOptions {
  enabled?: boolean;
}

export function useSupabaseEmailAccounts(
  organizationId: string,
  options: UseSupabaseEmailAccountsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmailAccount[], Error>({
    queryKey: supabaseKeys.emailAccounts.list(organizationId),
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("email_accounts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map(mapEmailAccountFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}
