import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MoreHorizontal, Pencil, Plus, Trash2, X } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import type { SavedView, FilterConfig, FilterCondition, FieldDef } from "./types";

export interface SavedViewsTabsProps {
  views: SavedView[];
  activeViewId: string | null;
  onViewChange: (viewId: string) => void;
  onCreateView: (name: string, filters?: FilterConfig) => void;
  onUpdateView: (viewId: string, updates: Partial<SavedView>) => void;
  onDeleteView: (viewId: string) => void;
  maxCustomViews?: number;
  currentFilterState?: FilterConfig;
  filterableFields?: FieldDef[];
}

const OPERATORS_FOR_TYPE: Record<string, string[]> = {
  text: ["equals", "notEquals", "contains", "notContains", "isEmpty", "isNotEmpty"],
  number: ["equals", "notEquals", "greaterThan", "lessThan", "between", "isEmpty", "isNotEmpty"],
  date: ["equals", "before", "after", "between", "isEmpty", "isNotEmpty"],
  select: ["equals", "notEquals", "isEmpty", "isNotEmpty"],
  boolean: ["equals"],
};

function FilterRow({
  condition,
  fields,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  fields: FieldDef[];
  onChange: (updated: FilterCondition) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const operatorLabels: Record<string, string> = {
    equals: t('operators.equals'),
    notEquals: t('operators.notEquals'),
    contains: t('operators.contains'),
    notContains: t('operators.notContains'),
    greaterThan: t('operators.greaterThan'),
    lessThan: t('operators.lessThan'),
    between: t('operators.between'),
    isEmpty: t('operators.isEmpty'),
    isNotEmpty: t('operators.isNotEmpty'),
    before: t('operators.before'),
    after: t('operators.after'),
  };
  const selectedField = fields.find((f) => f.id === condition.field);
  const operators = OPERATORS_FOR_TYPE[selectedField?.type ?? "text"] ?? OPERATORS_FOR_TYPE.text;
  const needsValue = !["isEmpty", "isNotEmpty"].includes(condition.operator);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={condition.field || undefined}
        onValueChange={(val) => onChange({ ...condition, field: val, value: "" })}
      >
        <SelectTrigger className="w-[130px] shrink-0">
          <SelectValue placeholder={t('views.fieldPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {fields.map((f) => (
            <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={condition.operator}
        onValueChange={(val) => onChange({ ...condition, operator: val as any })}
      >
        <SelectTrigger className="w-[120px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>{operatorLabels[op]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue && selectedField?.type === "select" && selectedField.options ? (
        <Select
          value={condition.value || undefined}
          onValueChange={(val) => onChange({ ...condition, value: val })}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={t('views.selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {selectedField.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : needsValue ? (
        <Input
          type={selectedField?.type === "number" ? "number" : selectedField?.type === "date" ? "date" : "text"}
          className="flex-1"
          value={condition.value ?? ""}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          placeholder={t('views.valuePlaceholder')}
        />
      ) : (
        <div className="flex-1" />
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function SavedViewsTabs({
  views,
  activeViewId,
  onViewChange,
  onCreateView,
  onUpdateView,
  onDeleteView,
  maxCustomViews = 5,
  currentFilterState,
  filterableFields = [],
}: SavedViewsTabsProps) {
  const { t } = useTranslation();
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingView, setEditingView] = useState<SavedView | null>(null);
  const [newName, setNewName] = useState("");
  const [contextMenuViewId, setContextMenuViewId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter builder state
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [filterLogic, setFilterLogic] = useState<"and" | "or">("and");

  const customViewCount = views.filter((v) => !v.isSystem).length;
  const canAddMore = customViewCount < maxCustomViews;

  const handleStartRename = (view: SavedView) => {
    setEditingView(view);
    setNewName(view.name);
    setRenameDialogOpen(true);
    setContextMenuViewId(null);
  };

  const handleConfirmRename = () => {
    if (editingView && newName.trim()) {
      onUpdateView(editingView.id, { name: newName.trim() });
    }
    setRenameDialogOpen(false);
    setEditingView(null);
    setNewName("");
  };

  const handleDelete = (viewId: string) => {
    onDeleteView(viewId);
    setContextMenuViewId(null);
  };

  const handleCreateView = () => {
    if (newName.trim()) {
      const filters: FilterConfig | undefined =
        filterConditions.length > 0
          ? { conditions: filterConditions.filter((c) => c.field), logic: filterLogic }
          : undefined;
      onCreateView(newName.trim(), filters);
    }
    setCreateDialogOpen(false);
    setNewName("");
    setFilterConditions([]);
    setFilterLogic("and");
  };

  const openCreateDialog = () => {
    setNewName("");
    setFilterConditions([]);
    setFilterLogic("and");
    setCreateDialogOpen(true);
  };

  const addFilterRow = () => {
    const defaultField = filterableFields[0]?.id ?? "";
    setFilterConditions((prev) => [
      ...prev,
      { field: defaultField, operator: "equals", value: "" },
    ]);
  };

  const updateFilterRow = (index: number, updated: FilterCondition) => {
    setFilterConditions((prev) =>
      prev.map((c, i) => (i === index ? updated : c))
    );
  };

  const removeFilterRow = (index: number) => {
    setFilterConditions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto scrollbar-none border-b"
      >
        {views.map((view) => {
          const isActive = view.id === activeViewId;
          const isCustom = !view.isSystem;

          return (
            <div key={view.id} className="relative flex items-center shrink-0">
              <button
                onClick={() => onViewChange(view.id)}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  "hover:text-foreground",
                  isActive
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                    : "text-muted-foreground"
                )}
              >
                {view.name}
              </button>
              {isCustom && (
                <Popover
                  open={contextMenuViewId === view.id}
                  onOpenChange={(open) =>
                    setContextMenuViewId(open ? view.id : null)
                  }
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
                        contextMenuViewId === view.id && "opacity-100"
                      )}
                      onMouseEnter={(e) => {
                        const parent = e.currentTarget.parentElement?.parentElement;
                        if (parent) parent.classList.add("group-hover");
                      }}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[160px] p-1" align="start">
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                      onClick={() => handleStartRename(view)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t('views.rename')}
                    </button>
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(view.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t('common.delete')}
                    </button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          );
        })}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-muted-foreground"
          disabled={!canAddMore}
          onClick={openCreateDialog}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('views.addView', { current: customViewCount, max: maxCustomViews })}
        </Button>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>{t('views.renameView')}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleConfirmRename()}
            placeholder={t('views.viewName')}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleConfirmRename} disabled={!newName.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create view dialog with filters */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('views.createView')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('views.viewName')}</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && filterConditions.length === 0 && handleCreateView()}
                placeholder={t('views.viewNamePlaceholder')}
                autoFocus
              />
            </div>

            {filterableFields.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t('views.filters')}</Label>
                  {filterConditions.length > 1 && (
                    <Select
                      value={filterLogic}
                      onValueChange={(val) => setFilterLogic(val as "and" | "or")}
                    >
                      <SelectTrigger className="h-7 w-auto px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="and">{t('views.matchAll')}</SelectItem>
                        <SelectItem value="or">{t('views.matchAny')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  {filterConditions.map((condition, index) => (
                    <FilterRow
                      key={index}
                      condition={condition}
                      fields={filterableFields}
                      onChange={(updated) => updateFilterRow(index, updated)}
                      onRemove={() => removeFilterRow(index)}
                    />
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={addFilterRow}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {t('views.addFilter')}
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleCreateView} disabled={!newName.trim()}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
