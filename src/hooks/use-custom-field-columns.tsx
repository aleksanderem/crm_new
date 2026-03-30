import { useMemo } from "react";
import {
  useSupabaseCustomFieldDefinitions,
  useSupabaseCustomFieldValuesBulk,
} from "@/hooks/use-supabase-custom-fields";
import type { CrmColumn } from "@/components/crm/enhanced-data-table";
import type { FieldDefinition } from "@/components/custom-fields/types";

interface UseCustomFieldColumnsOptions {
  organizationId: string;
  entityType: string;
  entityIds: string[];
  activityTypeKey?: string;
}

interface UseCustomFieldColumnsResult<TRow extends { _id: string }> {
  definitions: FieldDefinition[] | undefined;
  columns: CrmColumn<TRow & { __cfValues: Record<string, unknown> }>[];
  mergeCustomFieldValues: (entities: TRow[]) => (TRow & { __cfValues: Record<string, unknown> })[];
}

export function useCustomFieldColumns<TRow extends { _id: string }>({
  organizationId,
  entityType,
  entityIds,
  activityTypeKey,
}: UseCustomFieldColumnsOptions): UseCustomFieldColumnsResult<TRow> {
  const { data: rawDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    entityType,
    { activityTypeKey },
  );

  // Cast to FieldDefinition to preserve downstream compatibility
  const definitions = rawDefs as FieldDefinition[] | undefined;

  const { data: bulkValues } = useSupabaseCustomFieldValuesBulk(
    organizationId,
    entityType,
    entityIds,
  );

  const columns: CrmColumn<TRow & { __cfValues: Record<string, unknown> }>[] = useMemo(() => {
    if (!definitions || definitions.length === 0) return [];
    return definitions.map((def) => ({
      id: `cf_${def.fieldKey}`,
      label: def.name,
      render: (row: TRow & { __cfValues: Record<string, unknown> }) => {
        const val = row.__cfValues[def._id];
        if (val === undefined || val === null) return <span className="text-fg-quaternary">—</span>;
        if (typeof val === "boolean") return val ? "Yes" : "No";
        if (Array.isArray(val)) return val.join(", ");
        if (def.fieldType === "date" && typeof val === "number") {
          return new Date(val).toLocaleDateString();
        }
        return String(val);
      },
    }));
  }, [definitions]);

  const mergeCustomFieldValues = useMemo(() => {
    return (entities: TRow[]) =>
      entities.map((entity) => ({
        ...entity,
        __cfValues: bulkValues?.[entity._id] ?? {},
      }));
  }, [bulkValues]);

  return { definitions, columns, mergeCustomFieldValues };
}
