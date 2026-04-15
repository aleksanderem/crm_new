import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Selection, SortDescriptor } from "react-aria-components";
import { SearchLg } from "@untitledui/icons";
import { Table, TableCard } from "@untitled/app/table/table";
import { PaginationCardMinimal } from "@untitled/app/pagination/pagination";
import { EmptyState } from "@untitled/app/empty-state/empty-state";
import { Dropdown } from "@untitled/base/dropdown/dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { BadgeWithDot } from "@untitled/base/badges/badges";
import { BulkActionsBar } from "@/components/crm/bulk-actions";
import type { BulkAction, FieldDef } from "./types";

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

export interface CrmColumn<TData> {
  id: string;
  /** Label shown in the column header. */
  label?: string;
  /** Whether this column is sortable. */
  sortable?: boolean;
  /** Mark the first meaningful column as row header for a11y. */
  isRowHeader?: boolean;
  /** Extra className on <Table.Head> and <Table.Cell>. */
  className?: string;
  /** Render cell content for this column. */
  render: (item: TData) => ReactNode;
  /** Value used for sorting. Required if `sortable` is true. */
  getSortValue?: (item: TData) => string | number | boolean;
  /** If true, this cell has its own interaction (toggle, button, etc.) and won't be wrapped in a row-click link. */
  interactive?: boolean;
}

// ---------------------------------------------------------------------------
// Row action
// ---------------------------------------------------------------------------

interface RowAction<TData> {
  label: string;
  onClick: (item: TData) => void;
  icon?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CrmDataTableProps<TData> {
  columns: CrmColumn<TData>[];
  data: TData[];
  /** Extract a unique ID from each item. Defaults to `item._id ?? item.id ?? index`. */
  getRowId?: (item: TData, index: number) => string;
  enableBulkSelect?: boolean;
  onBulkAction?: (action: string, items: TData[]) => void;
  bulkActions?: BulkAction[];
  rowActions?: (item: TData) => RowAction<TData>[];
  isLoading?: boolean;
  defaultPageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Controlled sort descriptor (for saved views). */
  sortDescriptor?: SortDescriptor;
  onSortChange?: (descriptor: SortDescriptor) => void;
  /** Optional toolbar rendered inside the card above the table. */
  toolbar?: ReactNode;
  /** Column IDs to hide. */
  hiddenColumnIds?: Set<string>;
  /** Called when a non-interactive cell is clicked. Receives the row ID (from getRowId). Use for navigation. */
  onRowAction?: (rowId: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultGetRowId(item: any, index: number): string {
  return item._id ?? item.id ?? String(index);
}

function sortItems<T>(
  data: T[],
  descriptor: SortDescriptor | undefined,
  columns: CrmColumn<T>[],
): T[] {
  if (!descriptor?.column) return data;
  const col = columns.find((c) => c.id === String(descriptor.column));
  if (!col?.getSortValue) return data;
  return [...data].sort((a, b) => {
    const va = col.getSortValue!(a);
    const vb = col.getSortValue!(b);
    let cmp = 0;
    if (typeof va === "string" && typeof vb === "string") {
      cmp = va.localeCompare(vb);
    } else if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else if (typeof va === "boolean" && typeof vb === "boolean") {
      cmp = Number(va) - Number(vb);
    }
    return descriptor.direction === "descending" ? -cmp : cmp;
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrmDataTable<TData>({
  columns,
  data,
  getRowId = defaultGetRowId,
  enableBulkSelect = false,
  onBulkAction,
  bulkActions,
  rowActions,
  isLoading = false,
  defaultPageSize = 10,
  emptyTitle,
  emptyDescription,
  sortDescriptor: controlledSort,
  onSortChange: controlledSortChange,
  toolbar,
  hiddenColumnIds,
  onRowAction,
}: CrmDataTableProps<TData>) {
  const { t } = useTranslation();

  // --- Visible columns ---
  const visibleColumns = useMemo(
    () => (hiddenColumnIds?.size ? columns.filter((c) => !hiddenColumnIds.has(c.id)) : columns),
    [columns, hiddenColumnIds],
  );

  // --- Sorting ---
  const [internalSort, setInternalSort] = useState<SortDescriptor | undefined>(undefined);
  const sort = controlledSort ?? internalSort;
  const handleSortChange = (desc: SortDescriptor) => {
    controlledSortChange ? controlledSortChange(desc) : setInternalSort(desc);
  };

  // --- Pagination ---
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // --- Selection ---
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());

  // --- Derived data ---
  const sorted = useMemo(() => sortItems(data, sort, columns), [data, sort, columns]);
  const totalPages = Math.max(Math.ceil(sorted.length / pageSize), 1);
  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  // --- Selected items (for bulk actions) ---
  const selectedItems = useMemo(() => {
    if (selectedKeys === "all") return data;
    const keySet = selectedKeys as Set<string>;
    return data.filter((item, i) => keySet.has(getRowId(item, i)));
  }, [data, selectedKeys, getRowId]);

  // --- Loading ---
  if (isLoading) {
    return (
      <TableCard.Root size="sm">
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 flex-1" />
              <Skeleton className="h-5 w-28" />
            </div>
          ))}
        </div>
      </TableCard.Root>
    );
  }

  // --- Has row actions column? ---
  const hasActions = !!rowActions;

  return (
    <TableCard.Root size="sm">
      {/* Toolbar (search, filters, etc.) */}
      {toolbar && (
        <div className="border-b border-border-secondary px-4 py-3 md:px-5">
          {toolbar}
        </div>
      )}
      {/* Bulk-actions bar */}
      {enableBulkSelect && bulkActions && bulkActions.length > 0 && (
        <BulkActionsBar
          className="mx-4 my-3 md:mx-5 md:my-4"
          selectedCount={selectedItems.length}
          actions={bulkActions}
          onAction={(v) => {
            onBulkAction?.(v, selectedItems);
            setSelectedKeys(new Set());
          }}
          onClearSelection={() => setSelectedKeys(new Set())}
        />
      )}

      {paged.length > 0 ? (
        <Table
          aria-label="Data table"
          selectionMode={enableBulkSelect ? "multiple" : undefined}
          sortDescriptor={sort}
          onSortChange={handleSortChange}
          selectedKeys={enableBulkSelect ? selectedKeys : undefined}
          onSelectionChange={enableBulkSelect ? setSelectedKeys : undefined}
          onRowAction={onRowAction ? (key) => onRowAction(String(key)) : undefined}
        >
          <Table.Header>
            {visibleColumns.map((col) => (
              <Table.Head
                key={col.id}
                id={col.id}
                label={col.label}
                allowsSorting={col.sortable}
                isRowHeader={col.isRowHeader}
                className={col.className}
              />
            ))}
            {hasActions && <Table.Head id="actions" />}
          </Table.Header>
          <Table.Body>
            {paged.map((item, index) => {
              const rowId = getRowId(item, (page - 1) * pageSize + index);
              return (
                <Table.Row key={rowId} id={rowId}>
                  {visibleColumns.map((col) => (
                    <Table.Cell key={col.id} className={col.className}>
                      {onRowAction && !col.interactive ? (
                        <div
                          className="cursor-pointer -mx-5 -my-3 px-5 py-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRowAction(rowId);
                          }}
                          onPointerDown={(e) => {
                            // Prevent React Aria from starting selection on pointer down
                            e.stopPropagation();
                          }}
                        >
                          {col.render(item)}
                        </div>
                      ) : (
                        col.render(item)
                      )}
                    </Table.Cell>
                  ))}
                  {hasActions && (
                    <Table.Cell className="px-4">
                      <div className="flex justify-end">
                        <Dropdown.Root>
                          <Dropdown.DotsButton />
                          <Dropdown.Popover className="w-min">
                            <Dropdown.Menu>
                              {rowActions!(item).map((a) => (
                                <Dropdown.Item
                                  key={a.label}
                                  label={a.label}
                                  onAction={() => a.onClick(item)}
                                />
                              ))}
                            </Dropdown.Menu>
                          </Dropdown.Popover>
                        </Dropdown.Root>
                      </div>
                    </Table.Cell>
                  )}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      ) : (
        <div className="flex items-center justify-center px-8 py-20">
          <EmptyState size="sm">
            <EmptyState.Header pattern="none">
              <EmptyState.FeaturedIcon
                icon={SearchLg}
                color="gray"
                theme="modern"
                size="md"
                className="text-fg-quaternary"
              />
            </EmptyState.Header>
            <EmptyState.Content>
              <EmptyState.Title>
                {emptyTitle ?? t("table.noResults")}
              </EmptyState.Title>
              <EmptyState.Description>
                {emptyDescription ??
                  t("table.noResultsDescription", {
                    defaultValue: "Try adjusting your search or filters.",
                  })}
              </EmptyState.Description>
            </EmptyState.Content>
          </EmptyState>
        </div>
      )}

      {/* Pagination */}
      <PaginationCardMinimal
        page={page}
        total={totalPages}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </TableCard.Root>
  );
}

// ---------------------------------------------------------------------------
// Column visibility hook
// ---------------------------------------------------------------------------

export function useColumnVisibility(defaultHidden?: Set<string>, storageKey?: string) {
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(() => {
    if (storageKey) {
      try {
        const stored = localStorage.getItem(`col-vis:${storageKey}`);
        if (stored) return new Set(JSON.parse(stored) as string[]);
      } catch { /* ignore */ }
    }
    return defaultHidden ?? new Set();
  });

  const toggleColumn = useCallback((id: string) => {
    setHiddenColumnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (storageKey) {
        try { localStorage.setItem(`col-vis:${storageKey}`, JSON.stringify([...next])); } catch { /* ignore */ }
      }
      return next;
    });
  }, [storageKey]);

  const setHiddenColumns = useCallback((ids: Set<string>) => {
    setHiddenColumnIds(ids);
    if (storageKey) {
      try { localStorage.setItem(`col-vis:${storageKey}`, JSON.stringify([...ids])); } catch { /* ignore */ }
    }
  }, [storageKey]);

  return { hiddenColumnIds, toggleColumn, setHiddenColumns };
}

// ---------------------------------------------------------------------------
// Auto-generate columns from filterableFields
// ---------------------------------------------------------------------------

/**
 * Extends explicit `columns` with auto-generated columns for every
 * `filterableFields` entry that doesn't already have a column.
 * Auto-generated columns are hidden by default.
 */
export function useAllColumns<TData>(
  columns: CrmColumn<TData>[],
  filterableFields: FieldDef[],
  getFieldValue: (item: TData, fieldId: string) => unknown = (item, id) =>
    (item as Record<string, unknown>)[id],
) {
  return useMemo(() => {
    const existingIds = new Set(columns.map((c) => c.id));
    const defaultHidden = new Set<string>();

    const autoColumns: CrmColumn<TData>[] = filterableFields
      .filter((f) => !existingIds.has(f.id))
      .map((f) => {
        defaultHidden.add(f.id);
        return {
          id: f.id,
          label: f.label,
          sortable: true,
          render: (item: TData) => {
            const val = getFieldValue(item, f.id);
            if (val == null || val === "") return "—";
            if (f.type === "date" && typeof val === "number")
              return new Date(val).toLocaleDateString();
            if (f.type === "boolean") return String(val) === "true" ? "✓" : "—";
            if (f.type === "multiSelect" && f.options && Array.isArray(val)) {
              if (val.length === 0) return "—";
              const optMap = new Map(f.options.map((o) => [o.value, o.label]));
              return (
                <span className="flex flex-wrap gap-1">
                  {val.map((v: string) => (
                    <BadgeWithDot key={v} type="modern" color="brand" size="sm">
                      {optMap.get(v) ?? v}
                    </BadgeWithDot>
                  ))}
                </span>
              );
            }
            if (f.type === "select" && f.options) {
              const match = f.options.find((o) => o.value === String(val));
              if (match) {
                return (
                  <BadgeWithDot type="modern" color="brand" size="sm">
                    {match.label}
                  </BadgeWithDot>
                );
              }
              return String(val);
            }
            return String(val);
          },
          getSortValue: (item: TData) => {
            const val = getFieldValue(item, f.id);
            if (f.type === "number" || f.type === "date") return Number(val) || 0;
            return String(val ?? "");
          },
        };
      });

    return {
      allColumns: [...columns, ...autoColumns],
      defaultHidden,
    };
  }, [columns, filterableFields, getFieldValue]);
}
