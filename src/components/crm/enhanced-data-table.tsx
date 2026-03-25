import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
  type RowSelectionState,
  type Updater,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { SearchLg } from "@untitledui/icons";
import { TableCard } from "@untitled/app/table/table";
import { PaginationCardMinimal } from "@untitled/app/pagination/pagination";
import { EmptyState } from "@untitled/app/empty-state/empty-state";
import { Checkbox } from "@untitled/base/checkbox/checkbox";
import { Dropdown } from "@untitled/base/dropdown/dropdown";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableToolbar, type ToolbarDropdownAction } from "@/components/data-table/data-table-toolbar";
import { BulkActionsBar } from "@/components/crm/bulk-actions";
import { cx } from "@/lib/utils/cx";
import type { BulkAction } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RowAction<TData> {
  label: string;
  onClick: (row: TData) => void;
  icon?: React.ReactNode;
}

export interface CrmDataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  /** @deprecated Use frozenColumns instead. */
  stickyFirstColumn?: boolean;
  /** Number of leading columns to freeze (sticky). Checkbox column counts. */
  frozenColumns?: number;
  rowActions?: (row: TData) => RowAction<TData>[];
  onRowClick?: (row: TData) => void;
  enableBulkSelect?: boolean;
  onBulkAction?: (action: string, selectedRows: TData[]) => void;
  bulkActions?: BulkAction[];
  totalCount?: number;
  isLoading?: boolean;
  /** Hide the built-in toolbar. Use when providing an external toolbar (e.g. DataListFilterBar). */
  hideToolbar?: boolean;
  // Legacy toolbar props (only used when hideToolbar is false)
  searchKey?: string;
  searchPlaceholder?: string;
  filterableColumns?: { id: string; title: string; options: { label: string; value: string }[] }[];
  toolbarActions?: React.ReactNode;
  toolbarDropdownActions?: ToolbarDropdownAction[];
  // Controlled state for saved views
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (vis: VisibilityState) => void;
  sorting?: SortingState;
  onSortingChange?: (sort: SortingState) => void;
  defaultColumnVisibility?: VisibilityState;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the cumulative left offset for a frozen column at `index`. */
function frozenLeft(headers: { getSize: () => number }[], index: number): number {
  let px = 0;
  for (let i = 0; i < index; i++) px += headers[i].getSize();
  return px;
}

// ---------------------------------------------------------------------------
// UTUI-matching CSS constants (sm size)
// ---------------------------------------------------------------------------

/** Pseudo-element bottom border on <th> — UTUI Table.Header pattern */
const THEAD_BORDER =
  "[&>tr>th]:after:pointer-events-none [&>tr>th]:after:absolute [&>tr>th]:after:inset-x-0 [&>tr>th]:after:bottom-0 [&>tr>th]:after:h-px [&>tr>th]:after:bg-border-secondary";

/** Pseudo-element bottom border on <td> — UTUI Table.Row pattern */
const ROW_BORDER =
  "[&>td]:after:pointer-events-none [&>td]:after:absolute [&>td]:after:inset-x-0 [&>td]:after:bottom-0 [&>td]:after:h-px [&>td]:after:w-full [&>td]:after:bg-border-secondary last:[&>td]:after:hidden";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CrmDataTable<TData>({
  columns: userColumns,
  data,
  stickyFirstColumn = false,
  frozenColumns = 0,
  rowActions,
  onRowClick,
  enableBulkSelect = false,
  onBulkAction,
  bulkActions,
  isLoading = false,
  hideToolbar = false,
  searchKey,
  searchPlaceholder,
  filterableColumns = [],
  toolbarActions,
  toolbarDropdownActions,
  columnVisibility: controlledVisibility,
  onColumnVisibilityChange: controlledVisibilityChange,
  sorting: controlledSorting,
  onSortingChange: controlledSortingChange,
  defaultColumnVisibility,
}: CrmDataTableProps<TData>) {
  const { t } = useTranslation();

  // --- internal state (fallbacks when not controlled) ---
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>(
    () => defaultColumnVisibility ?? {},
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const sorting = controlledSorting ?? internalSorting;
  const visibility = controlledVisibility ?? internalVisibility;

  const handleSortingChange = (u: Updater<SortingState>) => {
    const next = typeof u === "function" ? u(sorting) : u;
    controlledSortingChange ? controlledSortingChange(next) : setInternalSorting(next);
  };

  const handleVisibilityChange = (u: Updater<VisibilityState>) => {
    const next = typeof u === "function" ? u(visibility) : u;
    controlledVisibilityChange ? controlledVisibilityChange(next) : setInternalVisibility(next);
  };

  // --- build column array ---
  const allColumns: ColumnDef<TData, any>[] = [];

  if (enableBulkSelect) {
    allColumns.push({
      id: "select",
      header: ({ table: t }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            size="md"
            isSelected={t.getIsAllPageRowsSelected()}
            isIndeterminate={!t.getIsAllPageRowsSelected() && t.getIsSomePageRowsSelected()}
            onChange={(v) => t.toggleAllPageRowsSelected(v)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            size="md"
            isSelected={row.getIsSelected()}
            onChange={(v) => row.toggleSelected(v)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 48,
    });
  }

  allColumns.push(...userColumns);

  if (rowActions) {
    allColumns.push({
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const acts = rowActions(row.original);
        if (!acts.length) return null;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Dropdown.Root>
              <Dropdown.DotsButton />
              <Dropdown.Popover className="w-min">
                <Dropdown.Menu>
                  {acts.map((a) => (
                    <Dropdown.Item key={a.label} label={a.label} onAction={() => a.onClick(row.original)} />
                  ))}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown.Root>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 64,
    });
  }

  // --- TanStack Table ---
  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, columnFilters, columnVisibility: visibility, rowSelection },
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: handleVisibilityChange,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableRowSelection: enableBulkSelect,
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows.map((r) => r.original);
  const pageCount = table.getPageCount();
  const { pageIndex, pageSize } = table.getState().pagination;
  const rows = table.getRowModel().rows;
  const hGroup = table.getHeaderGroups()[0];
  const freeze = stickyFirstColumn ? Math.max(frozenColumns, 1) : frozenColumns;

  // --- loading skeleton ---
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

  // --- render ---
  return (
    <TableCard.Root size="sm">
      {/* Legacy toolbar — only rendered when hideToolbar is false */}
      {!hideToolbar && (
        <div className="px-4 pt-3 md:px-5">
          <DataTableToolbar
            table={table}
            searchKey={searchKey}
            searchPlaceholder={searchPlaceholder}
            filterableColumns={filterableColumns}
            showViewOptions
            actions={toolbarActions}
            dropdownActions={toolbarDropdownActions}
          />
        </div>
      )}

      {/* Bulk-actions bar */}
      {enableBulkSelect && bulkActions && bulkActions.length > 0 && (
        <div className="px-4 md:px-5">
          <BulkActionsBar
            selectedCount={selectedRows.length}
            actions={bulkActions}
            onAction={(v) => {
              onBulkAction?.(v, selectedRows);
              setRowSelection({});
            }}
            onClearSelection={() => setRowSelection({})}
          />
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed"
          style={{ minWidth: `${Math.max(table.getTotalSize(), 600)}px` }}
        >
          <colgroup>
            {table.getVisibleLeafColumns().map((col) => (
              <col key={col.id} style={{ width: col.getSize() }} />
            ))}
          </colgroup>

          {/* --- Header (UTUI Table.Header sm) --- */}
          <thead className={cx("relative h-9 bg-bg-secondary", THEAD_BORDER)}>
            <tr>
              {hGroup.headers.map((header, idx) => {
                const frozen = idx < freeze;
                const isSelect = header.column.id === "select";
                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={cx(
                      "relative text-left align-middle text-xs font-semibold whitespace-nowrap text-fg-quaternary",
                      isSelect ? "w-12 py-2 pr-0 pl-4 md:pl-5" : "px-5 py-2",
                      frozen && "sticky z-20 bg-bg-secondary",
                    )}
                    style={frozen ? { left: frozenLeft(hGroup.headers, idx) } : undefined}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* --- Body (UTUI Table.Row sm + Table.Cell sm) --- */}
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={row.getIsSelected() || undefined}
                  className={cx(
                    "group relative h-14 transition-colors hover:bg-bg-secondary data-[selected]:bg-bg-secondary",
                    ROW_BORDER,
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const frozen = idx < freeze;
                    const isSelect = cell.column.id === "select";
                    const isActions = cell.column.id === "actions";
                    return (
                      <td
                        key={cell.id}
                        className={cx(
                          "relative overflow-hidden align-middle text-sm text-fg-tertiary",
                          isSelect
                            ? "py-2 pr-0 pl-4 md:pl-5"
                            : isActions
                              ? "px-3 py-3"
                              : "max-w-0 px-5 py-3",
                          frozen &&
                            "sticky z-10 bg-bg-primary group-hover:bg-bg-secondary group-data-[selected]:bg-bg-secondary",
                        )}
                        style={frozen ? { left: frozenLeft(hGroup.headers, idx) } : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={allColumns.length}>
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
                        <EmptyState.Title>{t("table.noResults")}</EmptyState.Title>
                        <EmptyState.Description>
                          {t("table.noResultsDescription", {
                            defaultValue: "Try adjusting your search or filters.",
                          })}
                        </EmptyState.Description>
                      </EmptyState.Content>
                    </EmptyState>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination (UTUI PaginationCardMinimal) */}
      <PaginationCardMinimal
        page={pageIndex + 1}
        total={Math.max(pageCount, 1)}
        pageSize={pageSize}
        onPageChange={(p) => table.setPageIndex(p - 1)}
        onPageSizeChange={(s) => table.setPageSize(s)}
      />
    </TableCard.Root>
  );
}
