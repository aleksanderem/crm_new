import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import type { FieldDefinition } from "@/components/custom-fields/types";

interface UseCustomFieldColumnsOptions {
  organizationId: string;
  entityType: string;
  entityIds: string[];
  activityTypeKey?: string;
}

interface UseCustomFieldColumnsResult<TRow extends { _id: string }> {
  definitions: FieldDefinition[] | undefined;
  columns: ColumnDef<TRow, unknown>[];
  defaultColumnVisibility: VisibilityState;
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
      organizationId,
      entityType: entityType as any,
      ...(activityTypeKey !== undefined ? { activityTypeKey } : {}),
    })
  );

  const { data: bulkValues } = useQuery({
    ...convexQuery(api.customFields.getValuesBulk, {
      organizationId,
      entityType: entityType as any,
      entityIds,
    }),
    enabled: entityIds.length > 0,
  });

  const columns: ColumnDef<TRow, unknown>[] = useMemo(() => {
    if (!definitions || definitions.length === 0) return [];
    return definitions.map((def) => ({
      id: `cf_${def.fieldKey}`,
      accessorFn: (row: TRow) => (row as TRow & { __cfValues: Record<string, unknown> }).__cfValues[def._id],
      header: def.name,
      cell: ({ getValue }: { getValue: () => unknown }) => {
        const val = getValue();
        if (val === undefined || val === null) return <span className="text-muted-foreground">—</span>;
        if (typeof val === "boolean") return val ? "Yes" : "No";
        if (Array.isArray(val)) return val.join(", ");
        if (def.fieldType === "date" && typeof val === "number") {
          return new Date(val).toLocaleDateString();
        }
        return String(val);
      },
    }));
  }, [definitions]);

  const defaultColumnVisibility: VisibilityState = useMemo(() => {
    const vis: VisibilityState = {};
    columns.forEach((col) => {
      if (col.id) vis[col.id] = false;
    });
    return vis;
  }, [columns]);

  const mergeCustomFieldValues = useMemo(() => {
    return (entities: TRow[]) =>
      entities.map((entity) => ({
        ...entity,
        __cfValues: bulkValues?.[entity._id] ?? {},
      }));
  }, [bulkValues]);

  return { definitions, columns, defaultColumnVisibility, mergeCustomFieldValues };
}
