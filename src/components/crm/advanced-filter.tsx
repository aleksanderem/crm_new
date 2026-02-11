import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  ChevronDown,
  Filter,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterCondition, FilterConfig, QuickFilterDef, FieldDef } from "./types";

const OPERATOR_LABELS: Record<FilterCondition["operator"], string> = {
  equals: "equals",
  notEquals: "does not equal",
  contains: "contains",
  notContains: "does not contain",
  greaterThan: "greater than",
  lessThan: "less than",
  between: "between",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  before: "before",
  after: "after",
};

const OPERATORS_BY_TYPE: Record<FieldDef["type"], FilterCondition["operator"][]> = {
  text: ["equals", "notEquals", "contains", "notContains", "isEmpty", "isNotEmpty"],
  number: ["equals", "notEquals", "greaterThan", "lessThan", "between", "isEmpty", "isNotEmpty"],
  date: ["equals", "before", "after", "between", "isEmpty", "isNotEmpty"],
  select: ["equals", "notEquals", "isEmpty", "isNotEmpty"],
  boolean: ["equals"],
};

const VALUE_LESS_OPERATORS: FilterCondition["operator"][] = ["isEmpty", "isNotEmpty"];

export interface AdvancedFilterProps {
  quickFilters?: QuickFilterDef[];
  availableFields: FieldDef[];
  value: FilterConfig;
  onChange: (config: FilterConfig) => void;
}

function QuickFilterChip({
  filter,
  activeValue,
  onSelect,
}: {
  filter: QuickFilterDef;
  activeValue: string | undefined;
  onSelect: (value: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = filter.options.find((o) => o.value === activeValue);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 border-dashed", activeValue && "border-solid border-primary")}
        >
          {filter.label}
          {selectedOption && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {selectedOption.label}
              </Badge>
            </>
          )}
          <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Filter ${filter.label}...`} />
          <CommandList>
            <CommandEmpty>No options found.</CommandEmpty>
            <CommandGroup>
              {filter.options.map((option) => {
                const isSelected = option.value === activeValue;
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      onSelect(isSelected ? undefined : option.value);
                      setOpen(false);
                    }}
                  >
                    <div
                      className={cn(
                        "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible"
                      )}
                    >
                      <Check className="h-4 w-4" />
                    </div>
                    <span>{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ConditionRow({
  condition,
  index,
  fields,
  onChange,
  onRemove,
}: {
  condition: FilterCondition;
  index: number;
  fields: FieldDef[];
  onChange: (index: number, condition: FilterCondition) => void;
  onRemove: (index: number) => void;
}) {
  const currentField = fields.find((f) => f.id === condition.field);
  const operators = currentField
    ? OPERATORS_BY_TYPE[currentField.type]
    : OPERATORS_BY_TYPE.text;
  const needsValue = !VALUE_LESS_OPERATORS.includes(condition.operator);

  return (
    <div className="flex items-center gap-2">
      <select
        value={condition.field}
        onChange={(e) =>
          onChange(index, { ...condition, field: e.target.value, value: "" })
        }
        className="h-8 rounded-md border bg-transparent px-2 text-sm"
      >
        <option value="">Select field</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        value={condition.operator}
        onChange={(e) =>
          onChange(index, {
            ...condition,
            operator: e.target.value as FilterCondition["operator"],
          })
        }
        className="h-8 rounded-md border bg-transparent px-2 text-sm"
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {OPERATOR_LABELS[op]}
          </option>
        ))}
      </select>
      {needsValue && (
        <>
          <input
            value={condition.value ?? ""}
            onChange={(e) =>
              onChange(index, { ...condition, value: e.target.value })
            }
            type={
              currentField?.type === "number"
                ? "number"
                : currentField?.type === "date"
                  ? "date"
                  : "text"
            }
            placeholder="Value"
            className="h-8 w-[120px] rounded-md border bg-transparent px-2 text-sm placeholder:text-muted-foreground"
          />
          {condition.operator === "between" && (
            <input
              value={condition.valueEnd ?? ""}
              onChange={(e) =>
                onChange(index, { ...condition, valueEnd: e.target.value })
              }
              type={
                currentField?.type === "number"
                  ? "number"
                  : currentField?.type === "date"
                    ? "date"
                    : "text"
              }
              placeholder="End"
              className="h-8 w-[120px] rounded-md border bg-transparent px-2 text-sm placeholder:text-muted-foreground"
            />
          )}
        </>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onRemove(index)}>
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}

export function AdvancedFilter({
  quickFilters = [],
  availableFields,
  value,
  onChange,
}: AdvancedFilterProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const quickFilterValues = new Map<string, string | undefined>();
  for (const condition of value.conditions) {
    const qf = quickFilters.find((f) => f.id === condition.field);
    if (qf && condition.operator === "equals") {
      quickFilterValues.set(qf.id, condition.value);
    }
  }

  const handleQuickFilterChange = (filterId: string, filterValue: string | undefined) => {
    const otherConditions = value.conditions.filter((c) => c.field !== filterId);
    if (filterValue) {
      otherConditions.push({ field: filterId, operator: "equals", value: filterValue });
    }
    onChange({ ...value, conditions: otherConditions });
  };

  const advancedConditions = value.conditions.filter(
    (c) => !quickFilters.some((qf) => qf.id === c.field && c.operator === "equals")
  );

  const handleConditionChange = (index: number, condition: FilterCondition) => {
    const quickConditions = value.conditions.filter((c) =>
      quickFilters.some((qf) => qf.id === c.field && c.operator === "equals")
    );
    const newAdvanced = [...advancedConditions];
    newAdvanced[index] = condition;
    onChange({ ...value, conditions: [...quickConditions, ...newAdvanced] });
  };

  const handleConditionRemove = (index: number) => {
    const quickConditions = value.conditions.filter((c) =>
      quickFilters.some((qf) => qf.id === c.field && c.operator === "equals")
    );
    const newAdvanced = advancedConditions.filter((_, i) => i !== index);
    onChange({ ...value, conditions: [...quickConditions, ...newAdvanced] });
  };

  const handleAddCondition = () => {
    const quickConditions = value.conditions.filter((c) =>
      quickFilters.some((qf) => qf.id === c.field && c.operator === "equals")
    );
    const newCondition: FilterCondition = {
      field: availableFields[0]?.id ?? "",
      operator: "equals",
      value: "",
    };
    onChange({
      ...value,
      conditions: [...quickConditions, ...advancedConditions, newCondition],
    });
  };

  const handleLogicToggle = () => {
    onChange({ ...value, logic: value.logic === "and" ? "or" : "and" });
  };

  const activeFilterCount = value.conditions.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quickFilters.map((qf) => (
        <QuickFilterChip
          key={qf.id}
          filter={qf}
          activeValue={quickFilterValues.get(qf.id)}
          onSelect={(v) => handleQuickFilterChange(qf.id, v)}
        />
      ))}

      <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 border-dashed">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 rounded-sm px-1 font-normal">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto min-w-[500px] p-4" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Advanced Filters</h4>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleLogicToggle}>
                Match {value.logic === "and" ? "all" : "any"} conditions
              </Button>
            </div>
            <Separator />
            {advancedConditions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No advanced filters applied.
              </p>
            ) : (
              <div className="space-y-2">
                {advancedConditions.map((condition, index) => (
                  <ConditionRow
                    key={index}
                    condition={condition}
                    index={index}
                    fields={availableFields}
                    onChange={handleConditionChange}
                    onRemove={handleConditionRemove}
                  />
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="h-8" onClick={handleAddCondition}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add condition
            </Button>
            {activeFilterCount > 0 && (
              <>
                <Separator />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onChange({ conditions: [], logic: "and" })}
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear all filters
                </Button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => onChange({ conditions: [], logic: "and" })}
        >
          Reset
          <X className="ml-1 h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
