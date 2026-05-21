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
  targetName?: string;
  targetSublabel?: string;
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

      // Enrich with target entity names/sublabels
      const targetIds = new Map<string, { type: string; ids: Set<string> }>();
      for (const rel of unique) {
        if (!targetIds.has(rel.targetType)) {
          targetIds.set(rel.targetType, { type: rel.targetType, ids: new Set() });
        }
        targetIds.get(rel.targetType)!.ids.add(rel.targetId);
      }

      const tableMap: Record<string, { table: string; cols: string[]; nameJoin?: (row: Record<string, unknown>) => string; subFmt?: (row: Record<string, unknown>) => string | undefined }> = {
        contact: {
          table: "contacts",
          cols: ["first_name", "last_name", "email"],
          nameJoin: (r) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
          subFmt: (r) => (r.email as string) || undefined,
        },
        company: {
          table: "companies",
          cols: ["name", "domain"],
          nameJoin: (r) => (r.name as string) ?? "",
          subFmt: (r) => (r.domain as string) || undefined,
        },
        deal: {
          table: "leads",
          cols: ["title", "value"],
          nameJoin: (r) => (r.title as string) ?? "",
          subFmt: (r) => r.value != null ? `${Number(r.value).toLocaleString("pl-PL")} PLN` : undefined,
        },
        lead: {
          table: "leads",
          cols: ["title", "value"],
          nameJoin: (r) => (r.title as string) ?? "",
          subFmt: (r) => r.value != null ? `${Number(r.value).toLocaleString("pl-PL")} PLN` : undefined,
        },
      };

      for (const [, group] of targetIds) {
        const cfg = tableMap[group.type];
        if (!cfg) continue;
        const ids = [...group.ids];
        const { data: rows } = await client
          .from(cfg.table)
          .select(`id, ${cfg.cols.join(", ")}`)
          .in("id", ids);
        if (!rows) continue;
        const lookup = new Map<string, { name?: string; sub?: string }>();
        for (const r of rows as Record<string, unknown>[]) {
          const name = cfg.nameJoin?.(r) ?? "";
          const sub = cfg.subFmt?.(r);
          lookup.set(r.id as string, { name: name || undefined, sub });
        }
        for (const rel of unique) {
          if (rel.targetType === group.type) {
            const entry = lookup.get(rel.targetId);
            if (entry) {
              rel.targetName = entry.name || undefined;
              rel.targetSublabel = entry.sub || undefined;
            }
          }
        }
      }

      return unique;
    },
    enabled: enabled && isReady && !!organizationId && !!entityId,
  } satisfies UseQueryOptions<MappedRelationship[], Error>);
}

// ---------------------------------------------------------------------------
// Contact IDs Linked to a Company (for nudge filtering)
// ---------------------------------------------------------------------------

/**
 * Returns the set of contact IDs that have at least one
 * `contact -> company` relationship row in the org. Used by the contacts page
 * to apply the `nudge=unlinked-company` filter (the inverse — contacts NOT in
 * this set are unlinked).
 *
 * Mirrors the backend logic in convex/nudges.ts.
 */
export function useSupabaseContactIdsLinkedToCompany(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<Set<string>, Error>({
    queryKey: [
      ...supabaseKeys.objectRelationships.list(organizationId),
      "contactIdsLinkedToCompany",
    ],
    queryFn: async (): Promise<Set<string>> => {
      if (!client) throw new Error("Supabase client not ready");

      const { data, error } = await client
        .from("object_relationships")
        .select("source_id")
        .eq("organization_id", organizationId)
        .eq("source_type", "contact")
        .eq("target_type", "company");

      if (error) throw error;
      return new Set(
        ((data ?? []) as { source_id: string }[]).map((r) => r.source_id),
      );
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<Set<string>, Error>);
}

// ---------------------------------------------------------------------------
// Company IDs Linked to a Contact (for nudge filtering)
// ---------------------------------------------------------------------------

/**
 * Returns the set of company IDs that have at least one relationship to a
 * contact in either direction (company -> contact OR contact -> company).
 * Used by the companies page to apply the `nudge=no-contacts` filter (the
 * inverse — companies NOT in this set have no linked contacts).
 *
 * Mirrors the backend logic in convex/nudges.ts.
 */
export function useSupabaseCompanyIdsLinkedToContact(
  organizationId: string,
  options: { enabled?: boolean } = {},
) {
  const { client, isReady } = useSupabase();
  const { enabled = true } = options;

  return useQuery<Set<string>, Error>({
    queryKey: [
      ...supabaseKeys.objectRelationships.list(organizationId),
      "companyIdsLinkedToContact",
    ],
    queryFn: async (): Promise<Set<string>> => {
      if (!client) throw new Error("Supabase client not ready");

      const [asSource, asTarget] = await Promise.all([
        client
          .from("object_relationships")
          .select("source_id")
          .eq("organization_id", organizationId)
          .eq("source_type", "company")
          .eq("target_type", "contact"),
        client
          .from("object_relationships")
          .select("target_id")
          .eq("organization_id", organizationId)
          .eq("source_type", "contact")
          .eq("target_type", "company"),
      ]);

      if (asSource.error) throw asSource.error;
      if (asTarget.error) throw asTarget.error;

      const linked = new Set<string>();
      for (const r of (asSource.data ?? []) as { source_id: string }[]) {
        linked.add(r.source_id);
      }
      for (const r of (asTarget.data ?? []) as { target_id: string }[]) {
        linked.add(r.target_id);
      }
      return linked;
    },
    enabled: enabled && isReady && !!organizationId,
  } satisfies UseQueryOptions<Set<string>, Error>);
}
