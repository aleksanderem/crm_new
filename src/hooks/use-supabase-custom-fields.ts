/**
 * React Query hooks for fetching custom field definitions and values from Supabase.
 * Entity-attached: definitions filtered by entityType, values by entityType + entityId.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { Database } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CfDefRow = Database["public"]["Tables"]["custom_field_definitions"]["Row"];
type CfValRow = Database["public"]["Tables"]["custom_field_values"]["Row"];

export interface MappedCustomFieldDefinition {
  _id: string;
  organizationId: string;
  entityType: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  options?: string[];
  isRequired?: boolean;
  order: number;
  group?: string;
  activityTypeKey?: string;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

export interface MappedCustomFieldValue {
  _id: string;
  organizationId: string;
  fieldDefinitionId: string;
  entityType: string;
  entityId: string;
  value?: unknown;
  createdAt: number;
  updatedAt: number;
  _source: "supabase";
}

function mapCfDef(row: CfDefRow): MappedCustomFieldDefinition {
  return {
    _id: row.id,
    organizationId: row.organization_id,
    entityType: row.entity_type,
    name: row.name,
    fieldKey: row.field_key,
    fieldType: row.field_type,
    options: row.options ?? undefined,
    isRequired: row.is_required ?? undefined,
    order: row.order,
    group: row.group ?? undefined,
    activityTypeKey: row.activity_type_key ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _source: "supabase",
  };
}

function mapCfVal(row: CfValRow): MappedCustomFieldValue {
  return {
    _id: row.id,
    organizationId: row.organization_id,
    fieldDefinitionId: row.field_definition_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    value: row.value ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _source: "supabase",
  };
}

// ---------------------------------------------------------------------------
// Definitions by EntityType
// ---------------------------------------------------------------------------

interface UseSupabaseCfDefsOptions {
  enabled?: boolean;
  activityTypeKey?: string;
}

/**
 * Fetches custom field definitions for a given entity type.
 */
export function useSupabaseCustomFieldDefinitions(
  organizationId: string,
  entityType: string,
  options: UseSupabaseCfDefsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true, activityTypeKey } = options;

  return useQuery<MappedCustomFieldDefinition[], Error>({
    queryKey: [...supabaseKeys.customFieldDefinitions.list(organizationId), entityType, activityTypeKey ?? ""],
    queryFn: async (): Promise<MappedCustomFieldDefinition[]> => {
      if (!client) throw new Error("Supabase client not ready");

      let query = client
        .from("custom_field_definitions")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .order("order", { ascending: true });

      if (activityTypeKey !== undefined) {
        query = query.eq("activity_type_key", activityTypeKey);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(mapCfDef);
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<MappedCustomFieldDefinition[], Error>);
}

// ---------------------------------------------------------------------------
// Values by Entity
// ---------------------------------------------------------------------------

interface UseSupabaseCfValsOptions {
  enabled?: boolean;
}

/**
 * Fetches custom field values for a specific entity instance.
 */
export function useSupabaseCustomFieldValues(
  organizationId: string,
  entityType: string,
  entityId: string | undefined,
  options: UseSupabaseCfValsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedCustomFieldValue[], Error>({
    queryKey: [...supabaseKeys.customFieldValues.list(organizationId), entityType, entityId ?? ""],
    queryFn: async (): Promise<MappedCustomFieldValue[]> => {
      if (!client || !entityId) return [];

      const { data, error } = await client
        .from("custom_field_values")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);

      if (error) throw error;
      return (data ?? []).map(mapCfVal);
    },
    enabled: enabled && isReady && !!organizationId && !!entityId,
  } satisfies UseQueryOptions<MappedCustomFieldValue[], Error>);
}

// ---------------------------------------------------------------------------
// Bulk Values by Entity IDs (for data table custom field columns)
// ---------------------------------------------------------------------------

/**
 * Fetches custom field values for multiple entities at once.
 * Returns a map of entityId → { [fieldDefinitionId]: value }.
 */
export function useSupabaseCustomFieldValuesBulk(
  organizationId: string,
  entityType: string,
  entityIds: string[],
  options: UseSupabaseCfValsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<Record<string, Record<string, unknown>>, Error>({
    queryKey: [...supabaseKeys.customFieldValues.list(organizationId), entityType, "bulk", ...entityIds.slice(0, 5)],
    queryFn: async (): Promise<Record<string, Record<string, unknown>>> => {
      if (!client || entityIds.length === 0) return {};

      const { data, error } = await client
        .from("custom_field_values")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("entity_type", entityType)
        .in("entity_id", entityIds);

      if (error) throw error;

      const result: Record<string, Record<string, unknown>> = {};
      for (const row of (data ?? []) as CfValRow[]) {
        if (!result[row.entity_id]) result[row.entity_id] = {};
        result[row.entity_id][row.field_definition_id] = row.value;
      }
      return result;
    },
    enabled: enabled && isReady && !!organizationId && entityIds.length > 0,
  } satisfies UseQueryOptions<Record<string, Record<string, unknown>>, Error>);
}
