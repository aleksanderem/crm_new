import { cn } from "@/lib/utils";
import {
  ACTIVITY_ICON_REGISTRY,
  ACTIVITY_ICON_NAMES,
} from "@/lib/activity-icon-registry";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface IconPickerProps {
  value: string;
  onChange: (name: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-8 gap-1.5">
        {ACTIVITY_ICON_NAMES.map((name) => {
          const Icon = ACTIVITY_ICON_REGISTRY[name];
          const isSelected = value === name;
          return (
            <Tooltip key={name}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border transition-colors hover:bg-accent",
                    isSelected && "border-primary bg-primary/10"
                  )}
                  onClick={() => onChange(name)}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{name}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
