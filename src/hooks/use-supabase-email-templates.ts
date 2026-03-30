/**
 * React Query hooks for fetching email templates from Supabase (PostgreSQL).
 */

import { useQuery } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapEmailTemplateFromSupabase,
  type MappedEmailTemplate,
} from "@/lib/supabase/mappers";

// ---------------------------------------------------------------------------
// Template List
// ---------------------------------------------------------------------------

interface UseSupabaseEmailTemplatesListOptions {
  enabled?: boolean;
  activeOnly?: boolean;
}

export function useSupabaseEmailTemplatesList(
  organizationId: string,
  options: UseSupabaseEmailTemplatesListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, activeOnly } = options;

  return useQuery<MappedEmailTemplate[], Error>({
    queryKey: [
      ...supabaseKeys.emailTemplates.list(organizationId),
      activeOnly ?? "all",
    ],
    queryFn: async () => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("email_templates")
        .select("*")
        .eq("organization_id", organizationId);

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;
      return (data ?? []).map(mapEmailTemplateFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  });
}

// ---------------------------------------------------------------------------
// Single Template
// ---------------------------------------------------------------------------

interface UseSupabaseEmailTemplateOptions {
  enabled?: boolean;
}

export function useSupabaseEmailTemplate(
  organizationId: string,
  templateId: string | undefined,
  options: UseSupabaseEmailTemplateOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedEmailTemplate | null, Error>({
    queryKey: supabaseKeys.emailTemplates.detail(
      organizationId,
      templateId ?? "",
    ),
    queryFn: async (): Promise<MappedEmailTemplate | null> => {
      if (!client || !templateId) return null;

      const { data, error } = await client
        .from("email_templates")
        .select("*")
        .eq("id", templateId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapEmailTemplateFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!templateId,
  });
}
