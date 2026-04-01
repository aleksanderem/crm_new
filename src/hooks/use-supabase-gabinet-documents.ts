/**
 * React Query hooks for fetching gabinet documents from Supabase.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  mapGabinetDocumentFromSupabase,
  type MappedGabinetDocument,
} from "@/lib/supabase/mappers/gabinet/documents";

// ---------------------------------------------------------------------------
// Documents List (with optional filters)
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetDocumentsListOptions {
  enabled?: boolean;
  patientId?: string;
  status?: string;
  limit?: number;
}

export function useSupabaseGabinetDocumentsList(
  organizationId: string,
  options: UseSupabaseGabinetDocumentsListOptions = {},
) {
  const { client, isReady } = useSupabase();
  const {
    enabled = true,
    patientId,
    status,
    limit = 200,
  } = options;

  return useQuery<MappedGabinetDocument[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetDocuments.list(organizationId),
      patientId ?? "",
      status ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetDocument[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("gabinet_documents")
        .select("*")
        .eq("organization_id", organizationId);

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }
      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetDocumentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedGabinetDocument[], Error>);
}

// ---------------------------------------------------------------------------
// Single Document
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetDocumentOptions {
  enabled?: boolean;
}

export function useSupabaseGabinetDocument(
  organizationId: string,
  documentId: string | undefined,
  options: UseSupabaseGabinetDocumentOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedGabinetDocument | null, Error>({
    queryKey: supabaseKeys.gabinetDocuments.detail(
      organizationId,
      documentId ?? "",
    ),
    queryFn: async (): Promise<MappedGabinetDocument | null> => {
      if (!client || !documentId) return null;

      const { data, error } = await client
        .from("gabinet_documents")
        .select("*")
        .eq("id", documentId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (error) throw error;
      return data ? mapGabinetDocumentFromSupabase(data) : null;
    },
    enabled: enabled && isReady && !!organizationId && !!documentId,
  } satisfies UseQueryOptions<MappedGabinetDocument | null, Error>);
}

// ---------------------------------------------------------------------------
// Documents by Patient
// ---------------------------------------------------------------------------

interface UseSupabaseGabinetDocumentsByPatientOptions {
  enabled?: boolean;
  limit?: number;
}

export function useSupabaseGabinetDocumentsByPatient(
  organizationId: string,
  patientId: string | undefined,
  options: UseSupabaseGabinetDocumentsByPatientOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, limit = 100 } = options;

  return useQuery<MappedGabinetDocument[], Error>({
    queryKey: [
      ...supabaseKeys.gabinetDocuments.list(organizationId),
      "byPatient",
      patientId ?? "",
    ],
    queryFn: async (): Promise<MappedGabinetDocument[]> => {
      if (!client || !patientId) return [];

      const { data, error } = await client
        .from("gabinet_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map(mapGabinetDocumentFromSupabase);
    },
    enabled: enabled && isReady && !!organizationId && !!patientId,
  } satisfies UseQueryOptions<MappedGabinetDocument[], Error>);
}
