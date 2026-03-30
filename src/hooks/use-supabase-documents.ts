/**
 * React Query hooks for fetching documents from Supabase (PostgreSQL).
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapDocumentFromSupabase, type MappedDocument } from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Documents List
// ---------------------------------------------------------------------------

interface UseSupabaseDocumentsListOptions {
  enabled?: boolean;
  limit?: number;
  category?: string;
  sortOrder?: "asc" | "desc";
}

export function useSupabaseDocumentsList(
  organizationId: string,
  options: UseSupabaseDocumentsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 200, category, sortOrder = "desc" } = options;

  return useQuery<MappedDocument[], Error>({
    queryKey: [...supabaseKeys.documents.list(organizationId), category ?? ""],
    queryFn: async (): Promise<MappedDocument[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("documents")
        .select("*")
        .eq("organization_id", organizationId);

      if (category?.trim()) {
        query = query.eq("category", category.trim());
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapDocumentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedDocument[], Error>);
}
