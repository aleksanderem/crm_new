import type { ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

export interface TreatmentOption {
  _id: string;
  name: string;
  duration: number;
  price?: number | null;
  currency?: string;
}

interface TreatmentPickerProps {
  treatments: TreatmentOption[] | undefined;
  value: string;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (search: string) => void;
  /** Format a price for the dropdown row. Different call sites use different
   *  currency rendering (PLN-only vs. multi-currency). */
  formatPrice: (price: number | null | undefined, currency?: string) => string;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  closeLabel: string;
  /** Override for the trigger label. Useful when the current selection is not
   *  present in `treatments` (e.g. an existing appointment whose treatment is
   *  not in the active list). */
  selectedLabel?: string;
  /** Optional icon rendered inside the trigger before the label. */
  triggerIcon?: ReactNode;
  triggerClassName?: string;
  triggerTestId?: string;
  disabled?: boolean;
}

export function TreatmentPicker({
  treatments,
  value,
  onSelect,
  open,
  onOpenChange,
  search,
  onSearchChange,
  formatPrice,
  placeholder,
  searchPlaceholder,
  emptyText,
  closeLabel,
  selectedLabel,
  triggerIcon,
  triggerClassName,
  triggerTestId,
  disabled,
}: TreatmentPickerProps) {
  const list = treatments ?? [];
  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((tr) => (tr.name ?? "").toLowerCase().includes(q));
  })();

  const fromList = list.find((tr) => tr._id === value)?.name;
  const triggerLabel = fromList ?? selectedLabel ?? placeholder;

  return (
    <Popover
      // `modal` stacks the popover's own `react-remove-scroll` lock on top of
      // the parent Dialog's lock. Without it, the Dialog's lock blocks wheel
      // events on the portaled popover content, so touchpad/wheel scrolling
      // through a long treatment list does nothing while the scrollbar drag
      // still works (issue #1850).
      modal
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) onSearchChange("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", triggerClassName)}
          data-testid={triggerTestId}
          disabled={disabled}
        >
          {triggerIcon ? (
            <span className="flex items-center gap-2 truncate">
              {triggerIcon}
              <span className="truncate">{triggerLabel}</span>
            </span>
          ) : (
            <span className="truncate">{triggerLabel}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{
          width: "var(--radix-popover-trigger-width)",
          maxHeight: "var(--radix-popover-content-available-height)",
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={onSearchChange}
            onClose={() => onOpenChange(false)}
            closeLabel={closeLabel}
          />
          <CommandList className="flex-1 min-h-0">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((tr) => (
                <CommandItem
                  key={tr._id}
                  value={tr._id}
                  onSelect={() => onSelect(tr._id)}
                  className={cn(
                    "px-3",
                    value === tr._id &&
                      "bg-accent font-medium text-accent-foreground",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{tr.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {tr.duration} min
                      {tr.price != null &&
                        ` · ${formatPrice(tr.price, tr.currency)}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
