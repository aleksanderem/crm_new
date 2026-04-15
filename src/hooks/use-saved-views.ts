import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useSupabaseSavedViewsList } from "@/hooks/use-supabase-saved-views";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import type { VisibilityState, SortingState } from "@tanstack/react-table";
import type { SavedView, FilterConfig, FilterCondition } from "@/components/crm/types";

interface UseSavedViewsOptions {
  organizationId: Id<"organizations">;
  entityType: string;
  systemViews: SavedView[];
  allColumnIds?: string[];
  defaultColumnVisibility?: VisibilityState;
}

function matchCondition(row: Record<string, any>, condition: FilterCondition): boolean {
  const value = row[condition.field];
  const target = condition.value;

  switch (condition.operator) {
    case "equals":
      return String(value ?? "") === String(target ?? "");
    case "notEquals":
      return String(value ?? "") !== String(target ?? "");
    case "contains":
      return String(value ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "notContains":
      return !String(value ?? "").toLowerCase().includes(String(target ?? "").toLowerCase());
    case "greaterThan":
      return Number(value) > Number(target);
    case "lessThan":
      return Number(value) < Number(target);
    case "between":
      return Number(value) >= Number(target) && Number(value) <= Number(condition.valueEnd);
    case "isEmpty":
      return value === undefined || value === null || value === "";
    case "isNotEmpty":
      return value !== undefined && value !== null && value !== "";
    case "before":
      return Number(value) < Number(target);
    case "after":
      return Number(value) > Number(target);
    case "hasAnyOf": {
      const arr = Array.isArray(value) ? value : [];
      const targets = Array.isArray(target) ? target : [target];
      return targets.some((t: string) => arr.includes(t));
    }
    case "hasAllOf": {
      const arr = Array.isArray(value) ? value : [];
      const targets = Array.isArray(target) ? target : [target];
      return targets.every((t: string) => arr.includes(t));
    }
    default:
      return true;
  }
}

export function applyFilterConditions<T>(data: T[], conditions: FilterCondition[]): T[] {
  if (!conditions.length) return data;
  return data.filter((item) => {
    const row = item as Record<string, any>;
    return conditions.filter((c) => c.field).every((c) => matchCondition(row, c));
  });
}

function applyFilterConfig<T>(data: T[], filterConfig: FilterConfig): T[] {
  if (!filterConfig.conditions.length) return data;

  return data.filter((item) => {
    const row = item as Record<string, any>;
    const results = filterConfig.conditions
      .filter((c) => c.field)
      .map((c) => matchCondition(row, c));
    if (results.length === 0) return true;
    return filterConfig.logic === "and"
      ? results.every(Boolean)
      : results.some(Boolean);
  });
}

export function useSavedViews({
  organizationId,
  entityType,
  systemViews,
  allColumnIds = [],
  defaultColumnVisibility = {},
}: UseSavedViewsOptions) {
  const defaultViewId =
    systemViews.find((v) => v.isDefault)?.id ?? systemViews[0]?.id ?? "all";

  const [activeViewId, setActiveViewId] = useState<string>(defaultViewId);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(defaultColumnVisibility);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // @ts-ignore — Convex useMutation hits TS2589 deep instantiation limit; runtime works fine
  const createViewMut = useMutation(api.savedViews.create);
  const updateViewMut = useMutation(api.savedViews.update);
  const removeViewMut = useMutation(api.savedViews.remove);
  const queryClient = useQueryClient();

  const { data: convexViews } = useSupabaseSavedViewsList(
    organizationId as string,
    { entityType },
  );

  const customViews: SavedView[] = useMemo(() => {
    if (!convexViews) return [];
    return convexViews.map((v) => ({
      id: v._id as string,
      name: v.name,
      isSystem: v.isSystem,
      isDefault: v.isDefault ?? false,
      filters: v.filters as FilterConfig | undefined,
      columns: v.columns,
      sortField: v.sortField,
      sortDirection: v.sortDirection as "asc" | "desc" | undefined,
    }));
  }, [convexViews]);

  const views = useMemo(
    () => [...systemViews, ...customViews],
    [systemViews, customViews]
  );

  const activeView = views.find((v) => v.id === activeViewId);

  const onViewChange = useCallback(
    (viewId: string) => {
      setActiveViewId(viewId);
      const view = views.find((v) => v.id === viewId);

      if (view?.sortField) {
        setSorting([{ id: view.sortField, desc: view.sortDirection === "desc" }]);
      } else {
        setSorting([]);
      }

      if (view?.columns && view.columns.length > 0 && allColumnIds.length > 0) {
        const vis: VisibilityState = {};
        for (const colId of allColumnIds) {
          vis[colId] = view.columns.includes(colId);
        }
        setColumnVisibility(vis);
      } else {
        setColumnVisibility(defaultColumnVisibility);
      }

      // Restore selected item for sidebar
      setSelectedId(view?.selectedId);
    },
    [views, allColumnIds, defaultColumnVisibility]
  );

  const onCreateView = useCallback(
    async (name: string, filters?: FilterConfig) => {
      const visibleCols =
        allColumnIds.length > 0
          ? allColumnIds.filter((id) => columnVisibility[id] !== false)
          : undefined;

      const viewId = await createViewMut({
        organizationId,
        entityType,
        name,
        filters: filters ?? null,
        columns: visibleCols,
        sortField: sorting[0]?.id,
        sortDirection: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : undefined,
        selectedId: selectedId,
        isSystem: false,
      });
      setActiveViewId(viewId as string);
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.savedViews.list(organizationId as string) });
    },
    [createViewMut, organizationId, entityType, allColumnIds, columnVisibility, sorting, selectedId, queryClient]
  );

  const onUpdateView = useCallback(
    async (viewId: string, updates: Partial<SavedView>) => {
      if (systemViews.some((v) => v.id === viewId)) return;
      await updateViewMut({
        organizationId,
        viewId: viewId as Id<"savedViews">,
        name: updates.name,
        filters: updates.filters ?? undefined,
        columns: updates.columns,
        sortField: updates.sortField,
        sortDirection: updates.sortDirection,
        selectedId: updates.selectedId,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.savedViews.list(organizationId as string) });
    },
    [updateViewMut, organizationId, systemViews, queryClient]
  );

  const onDeleteView = useCallback(
    async (viewId: string) => {
      if (systemViews.some((v) => v.id === viewId)) return;
      await removeViewMut({
        organizationId,
        viewId: viewId as Id<"savedViews">,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.savedViews.list(organizationId as string) });
      if (activeViewId === viewId) {
        setActiveViewId(defaultViewId);
      }
    },
    [removeViewMut, organizationId, systemViews, activeViewId, defaultViewId, queryClient]
  );

  const applyFilters = useCallback(
    <T,>(data: T[]): T[] => {
      if (!activeView?.filters) return data;
      const fc = activeView.filters as FilterConfig;
      if (!fc.conditions || fc.conditions.length === 0) return data;
      return applyFilterConfig(data, fc);
    },
    [activeView]
  );

  return {
    views,
    activeViewId,
    activeView,
    onViewChange,
    onCreateView,
    onUpdateView,
    onDeleteView,
    columnVisibility,
    sorting,
    setColumnVisibility,
    setSorting,
    selectedId,
    setSelectedId,
    applyFilters,
  };
}
