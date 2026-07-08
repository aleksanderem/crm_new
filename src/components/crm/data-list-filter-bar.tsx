import { Fragment, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  SearchMd,
  Plus,
  DotsVertical,
  ChevronDown,
  FilterLines,
  Columns03,
  Tag03,
  Folder,
  X,
} from "@untitledui/icons";
import { Button } from "@untitled/base/buttons/button";
import { CloseButton } from "@untitled/base/buttons/close-button";
import { Input } from "@untitled/base/input/input";
import { Dropdown } from "@untitled/base/dropdown/dropdown";
import { Select, type SelectItemType } from "@untitled/base/select/select";
import { SlideoutMenu } from "@untitled/app/slideout-menus/slideout-menu";
import { FeaturedIcon } from "@untitled/foundations/featured-icon/featured-icon";
import { CheckboxBase } from "@untitled/base/checkbox/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input as ShadcnInput } from "@/components/ui/input";
import { Button as ShadcnButton } from "@/components/ui/button";
import { cx } from "@/lib/utils/cx";
import type { FieldDef, FilterCondition, FilterConfig, SavedView } from "./types";

interface FilterRow {
  id: string;
  field: string;
  operator: string;
  value: string;
}

const CountBadge = ({ count, className }: { count: number; className?: string }) => (
  <span
    className={cx(
      "inline-flex items-center rounded-md border border-border-primary bg-bg-primary px-1.5 py-0.5 text-xs leading-[18px] font-medium text-fg-secondary shadow-xs",
      className,
    )}
  >
    {count}
  </span>
);

const OPERATORS_BY_TYPE: Record<
  FieldDef["type"],
  Array<{ value: string; labelKey: string }>
> = {
  text: [
    { value: "contains", labelKey: "operators.contains" },
    { value: "equals", labelKey: "operators.equals" },
    { value: "notContains", labelKey: "operators.notContains" },
    { value: "notEquals", labelKey: "operators.notEquals" },
    { value: "isEmpty", labelKey: "operators.isEmpty" },
    { value: "isNotEmpty", labelKey: "operators.isNotEmpty" },
  ],
  number: [
    { value: "equals", labelKey: "operators.equals" },
    { value: "greaterThan", labelKey: "operators.greaterThan" },
    { value: "lessThan", labelKey: "operators.lessThan" },
    { value: "between", labelKey: "operators.between" },
  ],
  date: [
    { value: "equals", labelKey: "operators.is" },
    { value: "before", labelKey: "operators.before" },
    { value: "after", labelKey: "operators.after" },
    { value: "between", labelKey: "operators.between" },
  ],
  select: [
    { value: "equals", labelKey: "operators.is" },
    { value: "notEquals", labelKey: "operators.isNot" },
  ],
  boolean: [
    { value: "equals", labelKey: "operators.is" },
  ],
  multiSelect: [
    { value: "hasAnyOf", labelKey: "operators.hasAnyOf" },
    { value: "hasAllOf", labelKey: "operators.hasAllOf" },
    { value: "isEmpty", labelKey: "operators.isEmpty" },
  ],
};

export interface DataListFilterBarProps {
  // Saved views (left side)
  views?: SavedView[];
  activeViewId?: string;
  onViewChange?: (viewId: string) => void;
  onCreateView?: (name: string, filters?: FilterConfig) => Promise<void>;
  onDeleteView?: (viewId: string) => Promise<void>;
  maxCustomViews?: number;
  filterableFields?: FieldDef[];
  createDialogOpen?: boolean;
  onCreateDialogOpenChange?: (open: boolean) => void;
  filterSlideoutOpen?: boolean;
  onFilterSlideoutOpenChange?: (open: boolean) => void;

  // Search (right side)
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  // Filters
  onFiltersChange?: (conditions: FilterCondition[]) => void;

  // Column picker
  columnDefs?: Array<{ id: string; label: string }>;
  hiddenColumnIds?: Set<string>;
  onToggleColumn?: (columnId: string) => void;
  onSetHiddenColumns?: (ids: Set<string>) => void;
  /** When provided, clicking the columns icon calls this instead of opening the built-in popover. */
  onColumnSettingsOpen?: () => void;

  // Extra dropdown actions
  dropdownActions?: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
  }>;

  // Tags & Categories management
  onTagsManage?: () => void;
  onCategoriesManage?: () => void;

  // Extra elements rendered on the left side next to the view selector
  leftExtras?: React.ReactNode;
}

let filterIdCounter = 0;
function nextFilterId() {
  return `f-${++filterIdCounter}`;
}

const DottedDivider = () => (
  <svg height="2" className="w-full shrink-0">
    <line
      x1="0"
      y1="1"
      x2="100%"
      y2="1"
      className="stroke-border-primary"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="0,6"
    />
  </svg>
);

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
  filterSlideoutOpen: externalFilterSlideoutOpen,
  onFilterSlideoutOpenChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  columnDefs,
  hiddenColumnIds,
  onToggleColumn,
  onSetHiddenColumns: _onSetHiddenColumns,
  onColumnSettingsOpen,
  onFiltersChange,
  dropdownActions = [],
  onTagsManage: _onTagsManage,
  onCategoriesManage: _onCategoriesManage,
  leftExtras,
}: DataListFilterBarProps) {
  const { t } = useTranslation();
  const [internalFilterSlideoutOpen, setInternalFilterSlideoutOpen] =
    useState(false);
  const [internalCreateDialogOpen, setInternalCreateDialogOpen] =
    useState(false);
  const [newViewName, setNewViewName] = useState("");

  const filterSlideoutOpen =
    externalFilterSlideoutOpen ?? internalFilterSlideoutOpen;
  const setFilterSlideoutOpen =
    onFilterSlideoutOpenChange ?? setInternalFilterSlideoutOpen;

  const createDialogOpen =
    externalCreateDialogOpen ?? internalCreateDialogOpen;
  const setCreateDialogOpen =
    onCreateDialogOpenChange ?? setInternalCreateDialogOpen;

  // Filter state
  const [draftFilters, setDraftFilters] = useState<FilterRow[]>([]);
  const [appliedConditions, setAppliedConditions] = useState<FilterCondition[]>([]);

  // Load filters from active view when view changes
  const activeViewFilters = views.find((v) => v.id === activeViewId)?.filters;
  useEffect(() => {
    if (activeViewFilters?.conditions?.length) {
      const rows: FilterRow[] = activeViewFilters.conditions.map((c) => ({
        id: nextFilterId(),
        field: c.field,
        operator: c.operator,
        value: c.value ?? "",
      }));
      setDraftFilters(rows);
      setAppliedConditions(activeViewFilters.conditions);
      onFiltersChange?.(activeViewFilters.conditions);
    } else {
      setDraftFilters([]);
      setAppliedConditions([]);
      onFiltersChange?.([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewId]);

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

  const handleClearSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLocalSearch("");
    onSearchChange("");
  }, [onSearchChange]);

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

  const handleApplyFilters = useCallback(() => {
    const conditions: FilterCondition[] = draftFilters
      .filter((f) => f.value || f.operator === "isEmpty" || f.operator === "isNotEmpty")
      .map((f) => ({
        field: f.field,
        operator: f.operator as FilterCondition["operator"],
        value: f.value,
      }));
    setAppliedConditions(conditions);
    onFiltersChange?.(conditions);
    setFilterSlideoutOpen(false);
  }, [draftFilters, onFiltersChange]);

  const handleClearAllFilters = useCallback(() => {
    setDraftFilters([]);
    setAppliedConditions([]);
    onFiltersChange?.([]);
  }, [onFiltersChange]);

  // Field lookup
  const fieldMap = useMemo(
    () => new Map(filterableFields.map((f) => [f.id, f])),
    [filterableFields],
  );

  // Select items for fields
  const fieldSelectItems: SelectItemType[] = useMemo(
    () => filterableFields.map((f) => ({ id: f.id, label: f.label })),
    [filterableFields],
  );

  // Operator items per filter
  const getOperatorItems = useCallback(
    (fieldId: string): SelectItemType[] => {
      const fieldDef = fieldMap.get(fieldId);
      const fieldType = fieldDef?.type ?? "text";
      return OPERATORS_BY_TYPE[fieldType].map((op) => ({
        id: op.value,
        label: t(op.labelKey),
      }));
    },
    [fieldMap, t],
  );

  const customViewCount = views.filter((v) => !v.isSystem).length;
  const canAddMore = customViewCount < maxCustomViews;

  const openCreateDialog = () => {
    setNewViewName("");
    setCreateDialogOpen(true);
  };

  const handleCreateView = async () => {
    if (newViewName.trim() && onCreateView) {
      const filters: FilterConfig | undefined =
        appliedConditions.length > 0
          ? { conditions: appliedConditions, logic: "and" }
          : undefined;
      await onCreateView(newViewName.trim(), filters);
    }
    setCreateDialogOpen(false);
    setNewViewName("");
  };

  // "Save as view" from filter slideout — apply filters first, then open create dialog
  const handleSaveAsView = useCallback(() => {
    const conditions: FilterCondition[] = draftFilters
      .filter((f) => f.value || f.operator === "isEmpty" || f.operator === "isNotEmpty")
      .map((f) => ({
        field: f.field,
        operator: f.operator as FilterCondition["operator"],
        value: f.value,
      }));
    setAppliedConditions(conditions);
    onFiltersChange?.(conditions);
    setFilterSlideoutOpen(false);
    setNewViewName("");
    setCreateDialogOpen(true);
  }, [draftFilters, onFiltersChange, setCreateDialogOpen]);

  const activeViewLabel = views.find((v) => v.id === activeViewId)?.name ?? views[0]?.name ?? "";

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

  // --- Full toolbar: views + search + filter trigger + actions ---
  const toolbarContent = (
    <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-3">
      {/* Left: view selector + add view */}
      <div className="flex shrink-0 items-center gap-2">
        {views.length > 0 && (
          <Dropdown.Root>
            <Button size="sm" color="secondary" iconTrailing={ChevronDown}>
              {activeViewLabel}
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu>
                {views.map((view) => (
                  <Dropdown.Item
                    key={view.id}
                    label={view.name}
                    onAction={() => onViewChange?.(view.id)}
                  />
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.Root>
        )}
        {onCreateView && canAddMore && (
          <button
            type="button"
            onClick={openCreateDialog}
            aria-label={t("views.addView", {
              current: customViewCount,
              max: maxCustomViews,
            })}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-1.5 text-sm font-medium text-fg-quaternary transition hover:text-fg-primary"
          >
            <Plus className="size-4" />
            <span className="hidden md:inline">
              {t("views.addView", {
                current: customViewCount,
                max: maxCustomViews,
              })}
            </span>
          </button>
        )}
        {leftExtras}
      </div>

      {/* Right: search + filter trigger (desktop) */}
      <div className="ml-auto hidden shrink-0 items-center gap-3 md:flex">
        <div className="relative w-[200px]">
          <Input
            size="sm"
            icon={SearchMd}
            placeholder={searchPlaceholder ?? t("common.search")}
            value={localSearch}
            onChange={handleSearchInput}
            inputClassName={localSearch ? "pr-9" : undefined}
          />
          {localSearch && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label={t("common.clearSearch", { defaultValue: "Wyczyść" })}
              className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-quaternary transition hover:bg-bg-primary_hover hover:text-fg-quaternary_hover focus:outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X className="size-4 stroke-[2.25px]" />
            </button>
          )}
        </div>
        {hasFilterableFields && (
          <Button
            size="sm"
            color="secondary"
            iconLeading={FilterLines}
            iconTrailing={ChevronDown}
            onClick={() => setFilterSlideoutOpen(true)}
            className={appliedConditions.length > 0 ? "bg-bg-primary_hover" : ""}
          >
            <span className="flex items-center gap-1.5">
              {t("filters.filters", { defaultValue: "Filters" })}
              {appliedConditions.length > 0 && (
                <CountBadge count={appliedConditions.length} />
              )}
            </span>
          </Button>
        )}
        {onColumnSettingsOpen && (
          <button type="button" className="group relative inline-flex h-max cursor-pointer items-center justify-center rounded-lg border border-border-primary bg-bg-primary px-2 py-1.5 text-fg-quaternary shadow-xs hover:bg-bg-primary_hover hover:text-fg-tertiary" onClick={onColumnSettingsOpen}>
            <Columns03 className="size-4 stroke-[2px]" />
          </button>
        )}
        {!onColumnSettingsOpen && columnDefs && columnDefs.length > 0 && onToggleColumn && (
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="group relative inline-flex h-max cursor-pointer items-center justify-center rounded-lg border border-border-primary bg-bg-primary px-2 py-1.5 text-fg-quaternary shadow-xs hover:bg-bg-primary_hover hover:text-fg-tertiary">
                <Columns03 className="size-4 stroke-[2px]" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="end">
              {columnDefs.map((col) => {
                const isVisible = !hiddenColumnIds?.has(col.id);
                return (
                  <button
                    key={col.id}
                    type="button"
                    className="flex min-h-11 w-full select-none items-center gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors hover:bg-bg-primary_hover active:bg-bg-primary_hover"
                    onClick={() => onToggleColumn(col.id)}
                  >
                    <CheckboxBase
                      isSelected={isVisible}
                      size="sm"
                      className="shrink-0 pointer-events-none"
                    />
                    <span className="grow truncate text-sm font-semibold text-fg-secondary">
                      {col.label ?? col.id}
                    </span>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        )}
        {(_onTagsManage || _onCategoriesManage) && (
          <Dropdown.Root>
            <Button
              size="sm"
              color="tertiary"
              iconLeading={_onTagsManage && _onCategoriesManage ? Folder : (_onTagsManage ? Tag03 : Folder)}
            />
            <Dropdown.Popover>
              <Dropdown.Menu>
                {_onTagsManage && (
                  <Dropdown.Item
                    label={t("common.tags", { defaultValue: "Tagi" })}
                    icon={Tag03}
                    onAction={_onTagsManage}
                  />
                )}
                {_onCategoriesManage && (
                  <Dropdown.Item
                    label={t("common.category", { defaultValue: "Kategorie" })}
                    icon={Folder}
                    onAction={_onCategoriesManage}
                  />
                )}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.Root>
        )}
        {renderMoreActions()}
      </div>

      {/* Mobile: inline search + filter + actions */}
      <div className="flex items-center gap-2 md:hidden">
        <div className="relative min-w-0 flex-1">
          <Input
            size="sm"
            icon={SearchMd}
            placeholder={searchPlaceholder ?? t("common.search")}
            value={localSearch}
            onChange={handleSearchInput}
            inputClassName={localSearch ? "pr-9" : undefined}
          />
          {localSearch && (
            <button
              type="button"
              onClick={handleClearSearch}
              aria-label={t("common.clearSearch", { defaultValue: "Wyczyść" })}
              className="absolute top-1/2 right-2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-fg-quaternary transition hover:bg-bg-primary_hover hover:text-fg-quaternary_hover focus:outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X className="size-4 stroke-[2.25px]" />
            </button>
          )}
        </div>
        {hasFilterableFields && (
          <Button
            size="sm"
            color="secondary"
            iconLeading={FilterLines}
            onClick={() => setFilterSlideoutOpen(true)}
          >
            {appliedConditions.length > 0 && (
              <CountBadge count={appliedConditions.length} />
            )}
          </Button>
        )}
        {dropdownActions.length > 0 && renderMoreActions()}
      </div>
    </div>
  );

  return (
    <>
      {toolbarContent}

      {/* Filter slideout */}
      <SlideoutMenu
        isOpen={filterSlideoutOpen}
        onOpenChange={setFilterSlideoutOpen}
        isDismissable
        className="z-50"
      >
        <SlideoutMenu.Header
          onClose={() => setFilterSlideoutOpen(false)}
          className="relative flex w-full items-start gap-3 px-4 pt-6 md:px-6"
        >
          <FeaturedIcon size="md" color="gray" theme="modern" icon={FilterLines} />
          <section className="flex flex-col gap-0.5">
            <h1 className="text-md font-semibold text-fg-primary md:text-lg">
              {t("filters.title", { defaultValue: "Filters" })}
            </h1>
            <p className="text-sm text-fg-tertiary">
              {t("filters.description", { defaultValue: "Add filters to narrow down results." })}
            </p>
          </section>
        </SlideoutMenu.Header>

        <SlideoutMenu.Content>
          <DottedDivider />
          {draftFilters.length === 0 ? (
            <div className="flex flex-col gap-4">
              <div className="flex max-w-[352px] flex-col gap-1 md:gap-0.5">
                <p className="text-sm font-semibold text-fg-primary md:text-md">
                  {t("filters.noFilters", { defaultValue: "No filters applied" })}
                </p>
                <p className="text-sm text-fg-tertiary">
                  {t("filters.description", { defaultValue: "Add filters to narrow down results." })}
                </p>
              </div>
              <div>
                <Button size="sm" color="secondary" iconLeading={Plus} onClick={handleAddFilter}>
                  {t("filters.addFilter", { defaultValue: "Add filter" })}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {draftFilters.map((filter, index) => {
                const fieldDef = fieldMap.get(filter.field);
                const fieldType = fieldDef?.type ?? "text";
                const noValue =
                  filter.operator === "isEmpty" || filter.operator === "isNotEmpty";
                return (
                  <Fragment key={filter.id}>
                    {index > 0 && <DottedDivider />}
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-3">
                        <Select
                          className="max-w-40 flex-1"
                          size="sm"
                          aria-label={t("filters.field", { defaultValue: "Filter field" })}
                          placeholder={t("filters.selectField", { defaultValue: "Select filter" })}
                          items={fieldSelectItems}
                          selectedKey={filter.field || null}
                          onSelectionChange={(key) =>
                            handleFilterChange(filter.id, { field: String(key) })
                          }
                        >
                          {(item: SelectItemType) => (
                            <Select.Item id={item.id}>{item.label}</Select.Item>
                          )}
                        </Select>
                        <Select
                          className="max-w-40 flex-1"
                          size="sm"
                          aria-label={t("filters.operator", { defaultValue: "Operator" })}
                          placeholder={t("filters.selectOperator", { defaultValue: "Operator" })}
                          items={getOperatorItems(filter.field)}
                          selectedKey={filter.operator || null}
                          onSelectionChange={(key) =>
                            handleFilterChange(filter.id, { operator: String(key) })
                          }
                        >
                          {(item: SelectItemType) => (
                            <Select.Item id={item.id}>{item.label}</Select.Item>
                          )}
                        </Select>
                      </div>
                      {!noValue && (
                        <div className="flex items-start gap-1">
                          {(fieldType === "select" || fieldType === "multiSelect") && fieldDef?.options?.length ? (
                            <Select
                              className="min-w-0 flex-1"
                              size="sm"
                              aria-label={t("filters.value", { defaultValue: "Value" })}
                              placeholder={t("filters.selectValue", { defaultValue: "Select a value" })}
                              items={fieldDef.options.map((o) => ({ id: o.value, label: o.label }))}
                              selectedKey={filter.value || null}
                              onSelectionChange={(key) =>
                                handleFilterChange(filter.id, { value: String(key) })
                              }
                            >
                              {(item: SelectItemType) => (
                                <Select.Item id={item.id}>{item.label}</Select.Item>
                              )}
                            </Select>
                          ) : (
                            <Input
                              className="min-w-0 flex-1"
                              size="sm"
                              aria-label={t("filters.value", { defaultValue: "Value" })}
                              placeholder={t("filters.enterValue", { defaultValue: "Enter a value" })}
                              type={
                                fieldType === "number"
                                  ? "number"
                                  : fieldType === "date"
                                    ? "date"
                                    : "text"
                              }
                              value={filter.value}
                              onChange={(value) =>
                                handleFilterChange(filter.id, { value })
                              }
                            />
                          )}
                          <CloseButton
                            label={t("filters.removeFilter", { defaultValue: "Remove filter" })}
                            size="sm"
                            onPress={() => handleRemoveFilter(filter.id)}
                          />
                        </div>
                      )}
                      {noValue && (
                        <div className="flex justify-end">
                          <CloseButton
                            label={t("filters.removeFilter", { defaultValue: "Remove filter" })}
                            size="sm"
                            onPress={() => handleRemoveFilter(filter.id)}
                          />
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              })}
              <DottedDivider />
              <div>
                <Button size="sm" color="secondary" iconLeading={Plus} onClick={handleAddFilter}>
                  {t("filters.addFilter", { defaultValue: "Add filter" })}
                </Button>
              </div>
            </>
          )}
        </SlideoutMenu.Content>

        <SlideoutMenu.Footer className="flex w-full flex-col gap-3">
          <div className="flex w-full items-center justify-between gap-3">
            {onCreateView && draftFilters.length > 0 && (
              <Button size="sm" color="tertiary" onClick={handleSaveAsView}>
                {t("filters.saveAsView", { defaultValue: "Save as view" })}
              </Button>
            )}
            <div className="ml-auto flex items-center gap-3">
              <Button size="sm" color="secondary" onClick={handleClearAllFilters}>
                {t("filters.clearAll", { defaultValue: "Clear all" })}
              </Button>
              <Button size="sm" onClick={handleApplyFilters}>
                {t("filters.apply", { defaultValue: "Apply filter" })}
              </Button>
            </div>
          </div>
        </SlideoutMenu.Footer>
      </SlideoutMenu>

      {/* Create view dialog */}
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
            {appliedConditions.length > 0 ? (
              <div className="space-y-1.5">
                <Label>{t("views.savedFilters", { defaultValue: "Filters to save" })}</Label>
                <div className="space-y-1 rounded-lg border border-border-secondary bg-bg-secondary p-3">
                  {appliedConditions.map((c, i) => {
                    const fieldDef = fieldMap.get(c.field);
                    return (
                      <p key={i} className="text-sm text-fg-secondary">
                        {fieldDef?.label ?? c.field}{" "}
                        <span className="text-fg-quaternary">{t(`operators.${c.operator}`, { defaultValue: c.operator })}</span>{" "}
                        {c.value && <span className="font-medium text-fg-primary">{c.value}</span>}
                      </p>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-quaternary">
                {t("views.noFiltersHint", { defaultValue: "No filters applied. The view will show all records." })}
              </p>
            )}
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
