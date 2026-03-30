/**
 * React Query hooks for fetching object relationships from Supabase.
 * Entity-attached: filtered by source entityType + entityId.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useSupabase } from "@/components/supabase-provider";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { Database } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RelRow = Database["public"]["Tables"]["object_relationships"]["Row"];

export interface MappedRelationship {
  _id: string;
  organizationId: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationshipType?: string;
  createdBy: string;
  createdAt: number;
  _source: "supabase";
}

function mapRelationship(row: RelRow): MappedRelationship {
  return {
    _id: row.id,
    organizationId: row.organization_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    relationshipType: row.relationship_type ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    _source: "supabase",
  };
}

// ---------------------------------------------------------------------------
// Relationships by Entity
// ---------------------------------------------------------------------------

interface UseSupabaseRelationshipsOptions {
  enabled?: boolean;
}

/**
 * Fetches relationships where the entity is either source or target.
 */
export function useSupabaseRelationshipsByEntity(
  organizationId: string,
  entityType: string,
  entityId: string | undefined,
  options: UseSupabaseRelationshipsOptions = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<MappedRelationship[], Error>({
    queryKey: [...supabaseKeys.objectRelationships.list(organizationId), entityType, entityId ?? ""],
    queryFn: async (): Promise<MappedRelationship[]> => {
      if (!client || !entityId) return [];

      // Fetch where entity is source
      const { data: asSource, error: errSource } = await client
        .from("object_relationships")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("source_type", entityType)
        .eq("source_id", entityId);

      if (errSource) throw errSource;

      // Fetch where entity is target
      const { data: asTarget, error: errTarget } = await client
        .from("object_relationships")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("target_type", entityType)
        .eq("target_id", entityId);

      if (errTarget) throw errTarget;

      // Merge and deduplicate by ID
      const all = [...((asSource ?? []) as RelRow[]), ...((asTarget ?? []) as RelRow[])];
      const seen = new Set<string>();
      const unique: MappedRelationship[] = [];
      for (const row of all) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          unique.push(mapRelationship(row));
        }
      }
      return unique;
    },
    enabled: enabled && isReady && !!organizationId && !!entityId,
  } satisfies UseQueryOptions<MappedRelationship[], Error>);
}
