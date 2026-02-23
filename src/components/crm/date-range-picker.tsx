import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { ChevronDownIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { CalendarIcon } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDateRange } from "./date-range-context";
import type { TimeRange } from "./types";

const PRESETS: { value: TimeRange; labelKey: string }[] = [
  { value: "today", labelKey: "dateRange.today" },
  { value: "last7days", labelKey: "dateRange.last7days" },
  { value: "last30days", labelKey: "dateRange.last30days" },
  { value: "thisMonth", labelKey: "dateRange.thisMonth" },
  { value: "last3months", labelKey: "dateRange.last3months" },
  { value: "thisYear", labelKey: "dateRange.thisYear" },
  { value: "all", labelKey: "dateRange.all" },
];

function formatRange(range: DateRange | undefined, allLabel: string): string {
  if (!range?.from) return allLabel;
  const from = format(range.from, "MMM d, yyyy");
  if (!range.to || range.from.getTime() === range.to.getTime()) return from;
  return `${format(range.from, "MMM d")} - ${format(range.to, "MMM d, yyyy")}`;
}

export function DateRangePicker() {
  const { t } = useTranslation();
  const { timeRange, dateRange, setPreset, setCustomRange } = useDateRange();
  const [open, setOpen] = useState(false);

  const activePreset = PRESETS.find((p) => p.value === timeRange);
  const label = activePreset
    ? t(activePreset.labelKey)
    : formatRange(dateRange, t("dateRange.all"));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-sm font-normal"
        >
          <CalendarIcon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
          <ChevronDownIcon className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-auto p-0" sideOffset={8}>
        {/* Presets sidebar */}
        <div className="flex flex-col gap-0.5 border-r p-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.value}
              variant={timeRange === preset.value ? "secondary" : "ghost"}
              size="sm"
              className="justify-start text-sm font-normal"
              onClick={() => {
                setPreset(preset.value);
                setOpen(false);
              }}
            >
              {t(preset.labelKey)}
            </Button>
          ))}
        </div>
        {/* Calendar range picker */}
        <div className="p-0">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                setCustomRange(range);
                setOpen(false);
              } else if (range?.from) {
                setCustomRange(range);
              }
            }}
            numberOfMonths={2}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
