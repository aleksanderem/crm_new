import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  RowSelectionState,
  Updater,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { BulkActionsBar } from "@/components/crm/bulk-actions";
import { MoreHorizontal, Pencil, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BulkAction } from "./types";

interface RowAction<TData> {
  label: string;
  onClick: (row: TData) => void;
  icon?: React.ReactNode;
}

export interface CrmDataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  stickyFirstColumn?: boolean;
  rowActions?: (row: TData) => RowAction<TData>[];
  onRowClick?: (row: TData) => void;
  enableBulkSelect?: boolean;
  onBulkAction?: (action: string, selectedRows: TData[]) => void;
  bulkActions?: BulkAction[];
  totalCount?: number;
  searchKey?: string;
  searchPlaceholder?: string;
  filterableColumns?: { id: string; title: string; options: { label: string; value: string }[] }[];
  isLoading?: boolean;

  // Controlled state for integration with saved views
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (vis: VisibilityState) => void;
  sorting?: SortingState;
  onSortingChange?: (sort: SortingState) => void;
  defaultColumnVisibility?: VisibilityState;
  toolbarActions?: React.ReactNode;
}

export function CrmDataTable<TData>({
  columns: userColumns,
  data,
  stickyFirstColumn = false,
  rowActions,
  onRowClick,
  enableBulkSelect = false,
  onBulkAction,
  bulkActions,
  totalCount,
  searchKey,
  searchPlaceholder,
  filterableColumns = [],
  isLoading = false,
  columnVisibility: controlledVisibility,
  onColumnVisibilityChange: controlledVisibilityChange,
  sorting: controlledSorting,
  onSortingChange: controlledSortingChange,
  defaultColumnVisibility,
  toolbarActions,
}: CrmDataTableProps<TData>) {
  const { t } = useTranslation();
  const [internalSorting, setInternalSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [internalVisibility, setInternalVisibility] = useState<VisibilityState>(
    () => defaultColumnVisibility ?? {}
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const effectiveSorting = controlledSorting ?? internalSorting;
  const effectiveVisibility = controlledVisibility ?? internalVisibility;

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const newValue = typeof updater === "function" ? updater(effectiveSorting) : updater;
    if (controlledSortingChange) {
      controlledSortingChange(newValue);
    } else {
      setInternalSorting(newValue);
    }
  };

  const handleVisibilityChange = (updater: Updater<VisibilityState>) => {
    const newValue = typeof updater === "function" ? updater(effectiveVisibility) : updater;
    if (controlledVisibilityChange) {
      controlledVisibilityChange(newValue);
    } else {
      setInternalVisibility(newValue);
    }
  };

  const columns: ColumnDef<TData, any>[] = [];

  if (enableBulkSelect) {
    columns.push({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    });
  }

  columns.push(...userColumns);

  if (rowActions) {
    columns.push({
      id: "actions",
      header: () => null,
      cell: ({ row }) => {
        const actions = rowActions(row.original);
        if (actions.length === 0) return null;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                actions[0]?.onClick(row.original);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    onClick={(e) => {
                      e.stopPropagation();
                      action.onClick(row.original);
                    }}
                  >
                    {action.icon && <span className="mr-2">{action.icon}</span>}
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 80,
    });
  }

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: effectiveSorting,
      columnFilters,
      columnVisibility: effectiveVisibility,
      rowSelection,
    },
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
  const displayCount = totalCount ?? data.length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-[280px]" />
          <Skeleton className="h-9 w-[100px]" />
        </div>
        <div className="rounded-md border">
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 flex-1" />
                <Skeleton className="h-5 w-[120px]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <DataTableToolbar
          table={table}
          searchKey={searchKey}
          searchPlaceholder={searchPlaceholder}
          filterableColumns={filterableColumns}
          showViewOptions
          actions={toolbarActions}
        />
        <p className="text-sm text-muted-foreground whitespace-nowrap ml-4">
          {t('table.recordCount', { count: displayCount })}
        </p>
      </div>

      {enableBulkSelect && bulkActions && bulkActions.length > 0 && (
        <BulkActionsBar
          selectedCount={selectedRows.length}
          actions={bulkActions}
          onAction={(actionValue) => {
            onBulkAction?.(actionValue, selectedRows);
            setRowSelection({});
          }}
          onClearSelection={() => setRowSelection({})}
        />
      )}

      <div className="rounded-md border">
        <div className="relative w-full overflow-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="[&_tr]:border-b">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b transition-colors hover:bg-muted/50">
                  {headerGroup.headers.map((header, index) => {
                    const isSticky = stickyFirstColumn && index === 0;
                    return (
                      <th
                        key={header.id}
                        colSpan={header.colSpan}
                        className={cn(
                          "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
                          isSticky && "sticky left-0 z-10 bg-background after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border"
                        )}
                        style={isSticky ? { minWidth: header.getSize() } : undefined}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell, index) => {
                      const isSticky = stickyFirstColumn && index === 0;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "p-4 align-middle [&:has([role=checkbox])]:pr-0",
                            isSticky && "sticky left-0 z-10 bg-background group-hover:bg-muted/50 data-[state=selected]:bg-muted after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border"
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Inbox className="h-10 w-10" />
                      <p className="text-sm">{t('table.noResults')}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <DataTablePagination table={table} />
    </div>
  );
}
