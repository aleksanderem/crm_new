import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Table } from "@tanstack/react-table";
import { FilterLines, SearchMd, Settings02, DotsVertical, Plus } from "@untitledui/icons";
import { Tabs, TabList, Tab } from "@untitled/app/tabs/tabs";
import { FilterBar } from "@untitled/app/filter-bar/filter-bar";
import { Button } from "@untitled/base/buttons/button";
import { Input } from "@untitled/base/input/input";
import { Dropdown } from "@untitled/base/dropdown/dropdown";
import { SlideoutMenu } from "@untitled/app/slideout-menus/slideout-menu";
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
import { Label } from "@/components/ui/label";
import { Input as ShadcnInput } from "@/components/ui/input";
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

  // --- Column picker (shadcn — no UTUI equivalent with checkboxes) ---
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

  // --- More actions dropdown (UTUI) ---
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
      {/* UTUI FilterBar layout */}
      <FilterBar.Root>
        <FilterBar.Content>
          {/* Left side: Saved view tabs (UTUI Tabs) */}
          {views.length > 0 && (
            <Tabs
              selectedKey={activeViewId ?? undefined}
              onSelectionChange={(key) => onViewChange?.(String(key))}
            >
              <TabList
                type="button-minimal"
                size="sm"
                items={tabItems}
              >
                {(item) => <Tab id={item.id}>{item.children}</Tab>}
              </TabList>
            </Tabs>
          )}
          {onCreateView && canAddMore && (
            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <Plus className="size-4" />
              {t("views.addView", {
                current: customViewCount,
                max: maxCustomViews,
              })}
            </button>
          )}
        </FilterBar.Content>

        {/* Right side: desktop controls (UTUI FilterBar.Actions) */}
        <FilterBar.Actions className="hidden md:flex">
          <Input
            size="sm"
            icon={SearchMd}
            placeholder={searchPlaceholder ?? t("common.search")}
            value={localSearch}
            onChange={handleSearchInput}
            className="w-[220px]"
          />
          {onFiltersClick && (
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
          )}
          {renderColumnPicker()}
          {renderMoreActions()}
        </FilterBar.Actions>

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
      </FilterBar.Root>

      {/* Mobile slideout (UTUI SlideoutMenu) */}
      <SlideoutMenu isOpen={mobileOpen} onOpenChange={setMobileOpen} isDismissable>
        <SlideoutMenu.Header onClose={() => setMobileOpen(false)}>
          <h2 className="text-lg font-semibold text-fg-primary">
            {t("views.filters")}
          </h2>
        </SlideoutMenu.Header>
        <SlideoutMenu.Content className="gap-4">
          <Input
            size="sm"
            icon={SearchMd}
            placeholder={searchPlaceholder ?? t("common.search")}
            value={localSearch}
            onChange={handleSearchInput}
          />
          {onFiltersClick && (
            <Button
              size="sm"
              color="secondary"
              iconLeading={FilterLines}
              className="w-full justify-start"
              onClick={() => {
                onFiltersClick();
                setMobileOpen(false);
              }}
            >
              {t("views.filters")}
              {activeFilterCount > 0 && (
                <span className="ml-auto inline-flex size-5 items-center justify-center rounded-full bg-brand-solid text-xs font-medium text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>
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
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm capitalize hover:bg-bg-secondary"
                    >
                      <input
                        type="checkbox"
                        checked={col.getIsVisible()}
                        onChange={(e) =>
                          col.toggleVisibility(e.target.checked)
                        }
                        className="size-4 rounded border-border-primary"
                      />
                      {col.id}
                    </label>
                  ))}
              </div>
            </div>
          )}
          {dropdownActions.length > 0 && (
            <div className="space-y-1 border-t border-border-secondary pt-3">
              {dropdownActions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  color="tertiary"
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
                </Button>
              ))}
            </div>
          )}
        </SlideoutMenu.Content>
      </SlideoutMenu>

      {/* Create view dialog (shadcn — no UTUI equivalent) */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("views.createView")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("views.viewName")}</Label>
              <ShadcnInput
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
