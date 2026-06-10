import { useCallback } from "react";
import { cn } from "@/lib/utils";

export interface AppointmentSlot {
  start: string;
  end: string;
}

interface SlotPickerProps {
  slots: readonly AppointmentSlot[];
  selectedStart: string | null | undefined;
  onSelect: (slot: AppointmentSlot) => void;
  layout: "list" | "grid";
  /**
   * When true, scrolls the selected slot button into view as soon as it
   * mounts. Used by the calendar appointment dialog so a pre-filled time
   * (from a calendar click or "Find nearest slot") is visible without
   * manual scrolling through the full day. Issue #786.
   */
  autoScrollSelected?: boolean;
}

export function SlotPicker({
  slots,
  selectedStart,
  onSelect,
  layout,
  autoScrollSelected = false,
}: SlotPickerProps) {
  const selectedRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (autoScrollSelected && node) {
        node.scrollIntoView({ block: "nearest" });
      }
    },
    [autoScrollSelected],
  );

  if (layout === "list") {
    return (
      <div className="space-y-1.5">
        {slots.map((slot) => {
          const isSelected = selectedStart === slot.start;
          return (
            <button
              key={slot.start}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              onClick={() => onSelect(slot)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                  : "bg-muted/40",
              )}
            >
              <span className="font-medium tabular-nums">{slot.start}</span>
              <span
                className={cn(
                  "text-xs",
                  isSelected
                    ? "text-primary-foreground/70"
                    : "text-muted-foreground",
                )}
              >
                {slot.end}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot) => {
        const isSelected = selectedStart === slot.start;
        return (
          <button
            key={slot.start}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            onClick={() => onSelect(slot)}
            className={cn(
              "rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors",
              "hover:bg-primary hover:text-primary-foreground active:bg-primary/90",
              isSelected && "bg-primary text-primary-foreground",
            )}
          >
            {slot.start}
          </button>
        );
      })}
    </div>
  );
}
