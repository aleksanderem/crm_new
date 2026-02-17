# Table UI Guidelines

Reference design: `dashboard-shell-08` from shadcn/studio.

## Structure

Every data table is wrapped in a `Card` with `className="py-0"`. The internal structure is:

```
<Card className="py-0">
  toolbar (px-4 pt-4 sm:px-6)
  bulk actions bar (optional)
  border-t + table
  border-t + pagination (px-4 pb-4 pt-2 sm:px-6)
</Card>
```

The table itself stretches edge-to-edge within the card (no horizontal padding on the table area). Toolbar and pagination have their own padding.

## Toolbar layout

The toolbar is a single row with two groups:

Left group (`flex-1`): search input, faceted filters, reset button, then the column visibility toggle ("Kolumny" / view options button).

Right group: optional custom action buttons, then a `MoreVertical` (three-dot) dropdown for secondary actions like CSV export and import.

```
[ Search ] [ Filters ] [ Reset ] [ Columns ]          [ ... ] [ ⋮ ]
```

The `MoreVertical` dropdown uses `DropdownMenu` with items of type `ToolbarDropdownAction`:

```ts
interface ToolbarDropdownAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}
```

Entity pages pass import/export as `toolbarDropdownActions` on `CrmDataTable`.

## Borders

No vertical borders anywhere in the table. The old sticky-column `after:` pseudo-element vertical borders are removed.

Horizontal borders: a single `border-t` separates the toolbar from the table, and another `border-t` separates the table from the pagination row. The card's own border provides the outer frame.

## Pagination and record count

The pagination row sits at the bottom of the card. Left side shows record count ("Showing N records") when no rows are selected, or selected count ("N of M row(s) selected") when bulk selection is active. Right side has page navigation controls (previous/next buttons, page size selector).

The `totalCount` prop on `DataTablePagination` controls the displayed record count. When omitted, it falls back to the table's filtered row count.

## Sticky columns

The first column can be sticky (`stickyFirstColumn` prop). It uses `sticky left-0 z-10 bg-background` on both `th` and `td`. No vertical border separators, the stickiness is subtle and only noticeable on horizontal scroll.

## CSV export/import pattern

Entity pages use the `useCsvExport` hook from `csv-export-button.tsx` to get a `handleExport` function, then pass it as a `toolbarDropdownActions` item alongside import:

```tsx
const { handleExport } = useCsvExport(organizationId, "contacts");

<CrmDataTable
  toolbarDropdownActions={[
    { label: t("csv.export"), icon: <Download className="h-4 w-4" />, onClick: handleExport },
    { label: t("csv.import"), icon: <Upload className="h-4 w-4" />, onClick: () => setImportOpen(true) },
  ]}
/>
```

## Key files

Component | File
--- | ---
CrmDataTable (main wrapper) | `src/components/crm/enhanced-data-table.tsx`
DataTableToolbar | `src/components/data-table/data-table-toolbar.tsx`
DataTablePagination | `src/components/data-table/data-table-pagination.tsx`
DataTableColumnHeader | `src/components/data-table/data-table-column-header.tsx`
DataTableViewOptions | `src/components/data-table/data-table-view-options.tsx`
DataTableFacetedFilter | `src/components/data-table/data-table-faceted-filter.tsx`
useCsvExport hook | `src/components/csv/csv-export-button.tsx`
CsvImportDialog | `src/components/csv/csv-import-dialog.tsx`
