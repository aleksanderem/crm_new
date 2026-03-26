import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
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
  const { data: definitions } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId: organizationId as Id<"organizations">,
      entityType: entityType as any,
      ...(activityTypeKey !== undefined ? { activityTypeKey } : {}),
    })
  );

  const { data: bulkValues } = useQuery({
    ...convexQuery(api.customFields.getValuesBulk, {
      organizationId: organizationId as Id<"organizations">,
      entityType: entityType as any,
      entityIds,
    }),
    enabled: entityIds.length > 0,
  });

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
