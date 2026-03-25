import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SearchMd, Plus, DotsVertical, FilterLines } from "@untitledui/icons";
import { Tabs, TabList, Tab } from "@untitled/app/tabs/tabs";
import { FilterBar } from "@untitled/app/filter-bar/filter-bar";
import { Button } from "@untitled/base/buttons/button";
import { Input } from "@untitled/base/input/input";
import { Dropdown } from "@untitled/base/dropdown/dropdown";
import { SlideoutMenu } from "@untitled/app/slideout-menus/slideout-menu";
import {
  FilterDropdown,
  CountBadge,
  type FilterRow,
} from "@untitled/app/filter-bar/filter-dropdown-menu";
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
import type { FieldDef, FilterCondition, FilterConfig } from "./types";

interface SavedViewDef {
  id: string;
  name: string;
  isSystem?: boolean;
  filters?: FilterConfig;
  columns?: Record<string, boolean>;
  sorting?: Array<{ id: string; desc: boolean }>;
}

const OPERATORS_BY_TYPE: Record<
  FieldDef["type"],
  Array<{ value: string; label: string }>
> = {
  text: [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "notContains", label: "Does not contain" },
    { value: "notEquals", label: "Does not equal" },
    { value: "isEmpty", label: "Is empty" },
    { value: "isNotEmpty", label: "Is not empty" },
  ],
  number: [
    { value: "equals", label: "Equals" },
    { value: "greaterThan", label: "Greater than" },
    { value: "lessThan", label: "Less than" },
    { value: "between", label: "Between" },
  ],
  date: [
    { value: "equals", label: "Is" },
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
    { value: "between", label: "Between" },
  ],
  select: [
    { value: "equals", label: "Is" },
    { value: "notEquals", label: "Is not" },
  ],
  boolean: [
    { value: "equals", label: "Is" },
  ],
};

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

  // Filters
  onFiltersChange?: (conditions: FilterCondition[]) => void;

  // Extra dropdown actions
  dropdownActions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  }>;
}

let filterIdCounter = 0;
function nextFilterId() {
  return `f-${++filterIdCounter}`;
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
  onFiltersChange,
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

  // Filter state
  const [draftFilters, setDraftFilters] = useState<FilterRow[]>([]);
  const [appliedCount, setAppliedCount] = useState(0);

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

  // Filter handlers
  const handleAddFilter = useCallback(() => {
    const firstField = filterableFields[0];
    if (!firstField) return;
    const ops = OPERATORS_BY_TYPE[firstField.type];
    setDraftFilters((prev) => [
      ...prev,
      {
        id: nextFilterId(),
        field: firstField.id,
        operator: ops[0].value,
        value: "",
      },
    ]);
  }, [filterableFields]);

  const handleRemoveFilter = useCallback((id: string) => {
    setDraftFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleFilterChange = useCallback(
    (id: string, patch: Partial<Omit<FilterRow, "id">>) => {
      setDraftFilters((prev) =>
        prev.map((f) => {
          if (f.id !== id) return f;
          const updated = { ...f, ...patch };
          // When field changes, reset operator and value
          if (patch.field && patch.field !== f.field) {
            const fieldDef = filterableFields.find((fd) => fd.id === patch.field);
            const ops = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : OPERATORS_BY_TYPE.text;
            updated.operator = ops[0].value;
            updated.value = "";
          }
          return updated;
        }),
      );
    },
    [filterableFields],
  );

  const handleApplyFilters = useCallback(
    (filters: FilterRow[]) => {
      const conditions: FilterCondition[] = filters
        .filter((f) => f.value || f.operator === "isEmpty" || f.operator === "isNotEmpty")
        .map((f) => ({
          field: f.field,
          operator: f.operator as FilterCondition["operator"],
          value: f.value,
        }));
      setAppliedCount(conditions.length);
      onFiltersChange?.(conditions);
    },
    [onFiltersChange],
  );

  const handleClearAllFilters = useCallback(() => {
    setDraftFilters([]);
    setAppliedCount(0);
    onFiltersChange?.([]);
  }, [onFiltersChange]);

  // Field lookup
  const fieldMap = useMemo(
    () => new Map(filterableFields.map((f) => [f.id, f])),
    [filterableFields],
  );

  const renderFilterRow = useCallback(
    (filter: FilterRow, onChange: (patch: Partial<Omit<FilterRow, "id">>) => void) => {
      const fieldDef = fieldMap.get(filter.field);
      const fieldType = fieldDef?.type ?? "text";
      const operators = OPERATORS_BY_TYPE[fieldType];
      const noValue = filter.operator === "isEmpty" || filter.operator === "isNotEmpty";

      return (
        <>
          {/* Field selector */}
          <select
            value={filter.field}
            onChange={(e) => onChange({ field: e.target.value })}
            className="h-9 min-w-[120px] rounded-lg border border-border-primary bg-bg-primary px-3 text-sm text-fg-primary outline-none focus:ring-2 focus:ring-brand"
          >
            {filterableFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {/* Operator selector */}
          <select
            value={filter.operator}
            onChange={(e) => onChange({ operator: e.target.value })}
            className="h-9 min-w-[130px] rounded-lg border border-border-primary bg-bg-primary px-3 text-sm text-fg-primary outline-none focus:ring-2 focus:ring-brand"
          >
            {operators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          {/* Value input */}
          {!noValue && (
            <input
              type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
              value={filter.value}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder="Value..."
              className="h-9 min-w-[140px] flex-1 rounded-lg border border-border-primary bg-bg-primary px-3 text-sm text-fg-primary placeholder:text-fg-quaternary outline-none focus:ring-2 focus:ring-brand"
            />
          )}
        </>
      );
    },
    [filterableFields, fieldMap],
  );

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

  const tabItems = views.map((view) => ({
    id: view.id,
    label: view.name,
    children: view.name,
  }));

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

  const hasFilterableFields = filterableFields.length > 0;

  return (
    <>
      {/* UTUI FilterBar layout */}
      <FilterBar.Root>
        <FilterBar.Content>
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
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-fg-quaternary transition hover:text-fg-primary"
            >
              <Plus className="size-4" />
              {t("views.addView", {
                current: customViewCount,
                max: maxCustomViews,
              })}
            </button>
          )}
        </FilterBar.Content>

        <FilterBar.Actions className="hidden md:flex">
          <Input
            size="sm"
            icon={SearchMd}
            placeholder={searchPlaceholder ?? t("common.search")}
            value={localSearch}
            onChange={handleSearchInput}
            className="w-[220px]"
          />
          {hasFilterableFields && (
            <FilterDropdown
              filters={draftFilters}
              appliedCount={appliedCount}
              onApply={handleApplyFilters}
              onClearAll={handleClearAllFilters}
              onAddFilter={handleAddFilter}
              onRemoveFilter={handleRemoveFilter}
              onFilterChange={handleFilterChange}
              renderFilterRow={renderFilterRow}
              placement="bottom end"
            />
          )}
          {renderMoreActions()}
        </FilterBar.Actions>

        {/* Mobile: open slideout */}
        <div className="flex items-center gap-2 md:hidden">
          <Button
            size="sm"
            color="secondary"
            iconLeading={SearchMd}
            onClick={() => setMobileOpen(true)}
          />
          {hasFilterableFields && appliedCount > 0 && (
            <CountBadge count={appliedCount} />
          )}
        </div>
      </FilterBar.Root>

      {/* Mobile slideout (UTUI SlideoutMenu) */}
      <SlideoutMenu isOpen={mobileOpen} onOpenChange={setMobileOpen} isDismissable>
        <SlideoutMenu.Header onClose={() => setMobileOpen(false)}>
          <h2 className="text-lg font-semibold text-fg-primary">
            {t("common.search")}
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

      {/* Create view dialog (shadcn — no UTUI modal/dialog equivalent) */}
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
