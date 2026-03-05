import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter } from "@/lib/ez-icons";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";

export interface FilterOption {
  label: string;
  value: string;
}

interface SidebarFilterActionProps {
  /** Sidebar dispatch action ID to listen for */
  dispatchId: string;
  /** Filter options to display */
  options: FilterOption[];
  /** Currently selected values */
  selected: string[];
  /** Callback when selection changes */
  onChange: (selected: string[]) => void;
  /** Button label */
  label?: string;
  /** Single select mode (radio behavior) */
  singleSelect?: boolean;
}

/**
 * Global sidebar filter action component.
 * 
 * Listens for sidebar dispatch events and shows a popover with filter options.
 * Supports both multi-select (checkbox) and single-select (radio) modes.
 * 
 * @example
 * <SidebarFilterAction
 *   dispatchId="openFilter"
 *   options={[
 *     { label: "Call", value: "call" },
 *     { label: "Meeting", value: "meeting" },
 *   ]}
 *   selected={typeFilter ? [typeFilter] : []}
 *   onChange={(vals) => setTypeFilter(vals[0] || null)}
 *   singleSelect
 * />
 */
export function SidebarFilterAction({
  dispatchId,
  options,
  selected,
  onChange,
  label = "Filter",
  singleSelect = false,
}: SidebarFilterActionProps) {
  const [open, setOpen] = useState(false);

  // Listen for sidebar dispatch events
  useSidebarDispatch(dispatchId, () => {
    setOpen(true);
  });

  const handleToggle = (value: string) => {
    if (singleSelect) {
      // Single select: replace selection
      onChange(selected.includes(value) ? [] : [value]);
    } else {
      // Multi-select: toggle in array
      if (selected.includes(value)) {
        onChange(selected.filter((v) => v !== value));
      } else {
        onChange([...selected, value]);
      }
    }
  };

  const handleReset = () => {
    onChange([]);
    if (singleSelect) {
      // Keep popover open for single select
    } else {
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={selected.length > 0 ? "bg-primary/10" : ""}
        >
          <Filter className="mr-2 h-4 w-4" />
          {label}
          {selected.length > 0 && (
            <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              {selected.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{label}</span>
            <Button
              variant="secondary"
              className="h-7 rounded-full px-2 py-1 text-xs"
              onClick={handleReset}
              disabled={selected.length === 0}
            >
              {selected.length > 0 ? "Clear" : "Reset"}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {options.map((option) => (
              <div key={option.value} className="flex items-center gap-2">
                <Checkbox
                  id={`filter-${option.value}`}
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => handleToggle(option.value)}
                />
                <Label
                  htmlFor={`filter-${option.value}`}
                  className="cursor-pointer text-sm font-normal"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
          {selected.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              className="w-full"
            >
              Apply
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
