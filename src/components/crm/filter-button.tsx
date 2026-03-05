import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, X } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface FilterOption {
  label: string;
  value: string;
  icon?: React.ReactNode;
}

interface FilterButtonProps {
  label: string;
  icon?: React.ReactNode;
  options: FilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export function FilterButton({
  label,
  icon,
  options,
  value,
  onChange,
}: FilterButtonProps) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(value && "bg-primary/10 border-primary/30")}
        >
          {icon}
          {selectedOption ? selectedOption.label : label}
          {value && (
            <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[10px]">
              1
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="flex flex-col">
          {options.map((option) => (
            <button
              key={option.value}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                value === option.value && "bg-accent"
              )}
              onClick={() => {
                onChange(value === option.value ? null : option.value);
                setOpen(false);
              }}
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {value === option.value && <Check className="h-3 w-3" />}
              </span>
              {option.icon}
              {option.label}
            </button>
          ))}
          {value && (
            <>
              <div className="my-1 border-t" />
              <button
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent cursor-pointer"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <X className="h-3 w-3" />
                Clear filter
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface ToggleFilterButtonProps {
  label: string;
  activeLabel?: string;
  icon?: React.ReactNode;
  active: boolean;
  onChange: (active: boolean) => void;
}

export function ToggleFilterButton({
  label,
  activeLabel,
  icon,
  active,
  onChange,
}: ToggleFilterButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(active && "bg-primary/10 border-primary/30")}
      onClick={() => onChange(!active)}
    >
      {icon}
      {active && activeLabel ? activeLabel : label}
    </Button>
  );
}
