/**
 * React Query hooks for fetching companies from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapCompanyFromSupabase, type MappedCompany } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Companies List
// ---------------------------------------------------------------------------

interface UseSupabaseCompaniesListOptions {
  enabled?: boolean;
  limit?: number;
  search?: string;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseCompaniesList(
  organizationId: string,
  options: UseSupabaseCompaniesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100, search, sortOrder = "desc" } = options;

  return useQuery<MappedCompany[], Error>({
    queryKey: [...supabaseKeys.companies.list(organizationId), search ?? ""],
    queryFn: async (): Promise<MappedCompany[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("companies")
        .select("*")
        .eq("organization_id", organizationId);

      if (search?.trim()) {
        query = query.textSearch("search_vector", search.trim(), {
          type: "websearch",
          config: "simple",
        });
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapCompanyFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedCompany[], Error>);
}

// ---------------------------------------------------------------------------
// Single Company
// ---------------------------------------------------------------------------

interface UseSupabaseCompanyOptions {
  enabled?: boolean;
}

export function useSupabaseCompany(
  organizationId: string,
  companyId: string | undefined,
  options: UseSupabaseCompanyOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedCompany | null, Error>({
    queryKey: supabaseKeys.companies.detail(organizationId, companyId ?? ""),
    queryFn: async (): Promise<MappedCompany | null> => {
      if (!client || !companyId) return null;

      const { data, error } = await client
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapCompanyFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!companyId,
  } satisfies UseQueryOptions<MappedCompany | null, Error>);
}
