/**
 * React Query hooks for fetching gabinet document templates from Supabase.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetDocumentTemplateFromSupabase,
  type MappedGabinetDocumentTemplate,
} from "@/lib/supabase/mappers/gabinet/document-templates";

// ---------------------------------------------------------------------------
// Document Templates List
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetDocumentTemplatesListOptions {
  enabled?: boolean;
  activeOnly?: boolean;
}

export function useSupabaseGabinetDocumentTemplatesList(
  organizationId: string,
  options: UseSupabaseGabinetDocumentTemplatesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, activeOnly = false } = options;

  return useQuery<MappedGabinetDocumentTemplate[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetDocumentTemplates.list(organizationId),
      activeOnly ? "active" : "all",
    ],
    queryFn: async (): Promise<MappedGabinetDocumentTemplate[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_document_templates")
        .select("*")
        .eq("organization_id", organizationId);

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query.order("sort_order", {
        ascending: true,
      });

      if (error) throw error;
      return (data ?? []).map(mapGabinetDocumentTemplateFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetDocumentTemplate[], Error>);
}

// ---------------------------------------------------------------------------
// Single Document Template
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetDocumentTemplateOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetDocumentTemplate(
  organizationId: string,
  templateId: string | undefined,
  options: UseSupabaseGabinetDocumentTemplateOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetDocumentTemplate | null, Error>({
    queryKey: supabaseKeys.gabinetDocumentTemplates.detail(
      organizationId,
      templateId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetDocumentTemplate | null> => {
      if (!client || !templateId) return null;

      const { data, error } = await client
        .from("gabinet_document_templates")
        .select("*")
        .eq("id", templateId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetDocumentTemplateFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!templateId,
  } satisfies UseQueryOptions<MappedGabinetDocumentTemplate | null, Error>);
}
