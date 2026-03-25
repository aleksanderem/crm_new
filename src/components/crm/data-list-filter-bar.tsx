import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Table } from "@tanstack/react-table";
import { FilterLines, SearchMd, Settings02, DotsVertical, Plus } from "@untitledui/icons";
import { Tabs, TabList, Tab } from "@/components/application/tabs/tabs";
import { Button } from "@/components/base/buttons/button";
import { Dropdown } from "@/components/base/dropdown/dropdown";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button as ShadcnButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FieldDef, FilterCondition, FilterConfig } from "./types";

interface SavedViewDef {
  id: string;
  name: string;
  isSystem?: boolean;
  filters?: FilterConfig;
  columns?: Record<string, boolean>;
  sorting?: Array<{ id: string; desc: boolean }>;
}

export interface DataListFilterBarProps {
  // Saved views (left side)
  views?: SavedViewDef[];
  activeViewId?: string;
  onViewChange?: (viewId: string) => void;
  onCreateView?: (name: string, filters: FilterCondition[]) => Promise<void>;
  onDeleteView?: (viewId: string) => Promise<void>;
  maxCustomViews?: number;
  filterableFields?: FieldDef[];
  createDialogOpen?: boolean;
  onCreateDialogOpenChange?: (open: boolean) => void;

  // Search (right side)
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  // Column picker - pass TanStack table instance
  table?: Table<any>;

  // Active filter count for badge
  activeFilterCount?: number;
  onFiltersClick?: () => void;

  // Extra dropdown actions
  dropdownActions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  }>;
}

export function DataListFilterBar({
  views = [],
  activeViewId,
  onViewChange,
  onCreateView,
  onDeleteView: _onDeleteView,
  maxCustomViews = 5,
  filterableFields = [],
  createDialogOpen: externalCreateDialogOpen,
  onCreateDialogOpenChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  table,
  activeFilterCount = 0,
  onFiltersClick,
  dropdownActions = [],
}: DataListFilterBarProps) {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [internalCreateDialogOpen, setInternalCreateDialogOpen] =
    useState(false);
  const [newViewName, setNewViewName] = useState("");

  const createDialogOpen =
    externalCreateDialogOpen ?? internalCreateDialogOpen;
  const setCreateDialogOpen =
    onCreateDialogOpenChange ?? setInternalCreateDialogOpen;

  // Debounced search
  const [localSearch, setLocalSearch] = useState(searchValue);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  const handleSearchInput = useCallback(
    (value: string) => {
      setLocalSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(value);
      }, 300);
    },
    [onSearchChange],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const customViewCount = views.filter((v) => !v.isSystem).length;
  const canAddMore = customViewCount < maxCustomViews;

  const openCreateDialog = () => {
    setNewViewName("");
    setCreateDialogOpen(true);
  };

  const handleCreateView = async () => {
    if (newViewName.trim() && onCreateView) {
      await onCreateView(newViewName.trim(), []);
    }
    setCreateDialogOpen(false);
    setNewViewName("");
  };

  // Build tab items from views for the Untitled UI Tabs component
  const tabItems = views.map((view) => ({
    id: view.id,
    label: view.name,
    children: view.name,
  }));

  // --- Shared right-side controls ---
  const renderSearch = (className?: string) => (
    <div className={cn("relative", className)}>
      <SearchMd className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-quaternary" />
      <input
        type="text"
        value={localSearch}
        onChange={(e) => handleSearchInput(e.target.value)}
        placeholder={searchPlaceholder ?? t("common.search")}
        className="h-9 w-full rounded-lg bg-primary pl-9 pr-3 text-sm text-primary shadow-xs ring-1 ring-primary ring-inset placeholder:text-placeholder outline-hidden focus:ring-2 focus:ring-brand sm:w-[220px]"
      />
    </div>
  );

  const renderFiltersButton = () => (
    <Button
      size="sm"
      color="secondary"
      iconLeading={FilterLines}
      onClick={onFiltersClick}
    >
      {t("views.filters")}
      {activeFilterCount > 0 && (
        <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-brand-solid text-xs font-medium text-white">
          {activeFilterCount}
        </span>
      )}
    </Button>
  );

  const renderColumnPicker = () => {
    if (!table) return null;
    const hideable = table
      .getAllColumns()
      .filter(
        (col) => typeof col.accessorFn !== "undefined" && col.getCanHide(),
      );
    if (hideable.length === 0) return null;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" color="secondary" iconLeading={Settings02}>
            {t("table.columns")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuLabel>{t("table.toggleColumns")}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hideable.map((col) => (
            <DropdownMenuCheckboxItem
              key={col.id}
              className="capitalize"
              checked={col.getIsVisible()}
              onCheckedChange={(value) => col.toggleVisibility(!!value)}
            >
              {col.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const renderMoreActions = () => {
    if (dropdownActions.length === 0) return null;
    return (
      <Dropdown.Root>
        <Button size="sm" color="tertiary" iconLeading={DotsVertical} />
        <Dropdown.Popover>
          <Dropdown.Menu>
            {dropdownActions.map((action) => (
              <Dropdown.Item
                key={action.label}
                label={action.label}
                onAction={action.onClick}
              />
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown.Root>
    );
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        {/* Left side: Saved view tabs */}
        <div className="min-w-0 flex-1 overflow-x-auto scrollbar-none">
          {views.length > 0 ? (
            <Tabs
              selectedKey={activeViewId ?? undefined}
              onSelectionChange={(key) =>
                onViewChange?.(String(key))
              }
            >
              <TabList
                type="button-minimal"
                size="sm"
                items={tabItems}
              >
                {(item) => <Tab id={item.id}>{item.children}</Tab>}
              </TabList>
            </Tabs>
          ) : null}
          {onCreateView && canAddMore && (
            <button
              type="button"
              onClick={openCreateDialog}
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <Plus className="size-4" />
              {t("views.addView", {
                current: customViewCount,
                max: maxCustomViews,
              })}
            </button>
          )}
        </div>

        {/* Right side: desktop controls */}
        <div className="hidden items-center gap-2 md:flex">
          {renderSearch()}
          {onFiltersClick && renderFiltersButton()}
          {renderColumnPicker()}
          {renderMoreActions()}
        </div>

        {/* Right side: mobile trigger */}
        <div className="flex items-center md:hidden">
          <Button
            size="sm"
            color="secondary"
            iconLeading={FilterLines}
            onClick={() => setMobileOpen(true)}
          >
            {activeFilterCount > 0 && (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-brand-solid text-xs font-medium text-white">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{t("views.filters")}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            {renderSearch("w-full [&_input]:w-full")}
            {onFiltersClick && (
              <div>
                <ShadcnButton
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    onFiltersClick();
                    setMobileOpen(false);
                  }}
                >
                  <FilterLines className="mr-2 size-4" />
                  {t("views.filters")}
                  {activeFilterCount > 0 && (
                    <span className="ml-auto inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </ShadcnButton>
              </div>
            )}
            {table && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t("table.columns")}
                </Label>
                <div className="space-y-1">
                  {table
                    .getAllColumns()
                    .filter(
                      (col) =>
                        typeof col.accessorFn !== "undefined" &&
                        col.getCanHide(),
                    )
                    .map((col) => (
                      <label
                        key={col.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={col.getIsVisible()}
                          onChange={(e) =>
                            col.toggleVisibility(e.target.checked)
                          }
                          className="size-4 rounded border-border"
                        />
                        {col.id}
                      </label>
                    ))}
                </div>
              </div>
            )}
            {dropdownActions.length > 0 && (
              <div className="space-y-1 border-t pt-3">
                {dropdownActions.map((action) => (
                  <ShadcnButton
                    key={action.label}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      action.onClick();
                      setMobileOpen(false);
                    }}
                  >
                    {action.icon && (
                      <span className="mr-2">{action.icon}</span>
                    )}
                    {action.label}
                  </ShadcnButton>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Create view dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("views.createView")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("views.viewName")}</Label>
              <Input
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateView()}
                placeholder={t("views.viewNamePlaceholder")}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <ShadcnButton
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(false)}
            >
              {t("common.cancel")}
            </ShadcnButton>
            <ShadcnButton
              size="sm"
              onClick={handleCreateView}
              disabled={!newViewName.trim()}
            >
              {t("common.create")}
            </ShadcnButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
