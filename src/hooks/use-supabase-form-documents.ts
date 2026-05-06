/**
 * React Query hooks for fetching form documents from Supabase (PostgreSQL).
 *
 * These hooks provide the same interface as the existing Convex queries
 * but fetch data from Supabase (PostgreSQL) instead.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { mapFormDocumentFromSupabase, type MappedFormDocument } from "@/lib/supabase/mappers/form-documents";

// ---------------------------------------------------------------------------
// Form Documents List
// ---------------------------------------------------------------------------

interface UseSupabaseFormDocumentsListOptions {
  enabled?: boolean;
  limit?: number;
  status?: string;
  category?: string;
  entityType?: string;
  entityId?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * Fetches the form documents list for an organization from PostgreSQL via supabase-js.
 *
 * Returns data in the same shape as `Doc<'formDocuments'>` so existing UI
 * components work without changes.
 */
export function useSupabaseFormDocumentsList(
  organizationId: string,
  options: UseSupabaseFormDocumentsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    limit = 200,
    status,
    category,
    entityType,
    entityId,
    sortOrder = "desc",
  } = options;

  return useQuery<MappedFormDocument[], Error>({
    queryKey: [
      ...supabaseKeys.formDocuments.list(organizationId),
      status ?? "",
      category ?? "",
      entityType ?? "",
      entityId ?? "",
    ],
    queryFn: async (): Promise<MappedFormDocument[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("form_documents")
        .select("*")
        .eq("organization_id", organizationId);

      if (status?.trim()) {
        query = query.eq("status", status.trim());
      }
      if (entityType?.trim()) {
        query = query.eq("entity_type", entityType.trim());
      }
      if (entityId?.trim()) {
        query = query.eq("entity_id", entityId.trim());
      }
      if (category?.trim()) {
        // Filter by template category - need to join with form_templates
        query = query.contains("template_id", ""); // This would need a join - simplified for now
      }

      const { data, error } = await query
        .order("created_at", { ascending: sortOrder === "asc" })
        .limit(limit);

      if (error) throw error;

      const mapped = (data ?? []).map(mapFormDocumentFromSupabase);

      // If category filter is set, filter by template category in memory
      // (In production, this should be done via a database join or view)
      if (category?.trim()) {
        const templateIds = mapped
          .filter((doc) => {
            // This is a placeholder - we'd need template data
            // For now, return all docs if category filter is set
            return true;
          })
          .map((doc) => doc._id);
        return mapped.filter((doc) => templateIds.includes(doc._id));
      }

      return mapped;
    },
    enabled:
      enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedFormDocument[], Error>);
}

// ---------------------------------------------------------------------------
// Form Document Detail
// ---------------------------------------------------------------------------

export function useSupabaseFormDocument(
  organizationId: string,
  documentId: string | undefined,
  options: Omit<UseQueryOptions<MappedFormDocument | null, Error>, "queryKey" | "queryFn"> = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedFormDocument | null, Error>({
    queryKey: supabaseKeys.formDocuments.detail(organizationId, documentId ?? ""),
    queryFn: async (): Promise<MappedFormDocument | null> => {
      if (!client) throw new Error("Supabase client not ready");
      if (!documentId) return null;

      const { data, error } = await client
        .from("form_documents")
        .select("*")
        .eq("id", documentId)
        .eq("organization_id", organizationId)
        .single();

      if (error) {
        if (error.code === "PGRST116") return null; // Not found
        throw error;
      }

      return data ? mapFormDocumentFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!documentId,
  });
}

// ---------------------------------------------------------------------------
// Form Documents by Entity
// ---------------------------------------------------------------------------

export function useSupabaseFormDocumentsByEntity(
  organizationId: string,
  entityType: string,
  entityId: string,
  options: Omit<UseQueryOptions<MappedFormDocument[], Error>, "queryKey" | "queryFn"> = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedFormDocument[], Error>({
    queryKey: [
      "supabase",
      "formDocuments",
      "byEntity",
      organizationId,
      entityType,
      entityId,
    ],
    queryFn: async (): Promise<MappedFormDocument[]> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("form_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map(mapFormDocumentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!entityType && !!entityId,
  });
}
