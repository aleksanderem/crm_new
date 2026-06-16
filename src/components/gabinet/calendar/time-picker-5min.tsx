import { useMemo } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TimePicker5MinProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

// `<input type="time" step={300}>` shows a per-minute wheel on iOS Safari
// because iOS ignores the step attribute on time inputs (#1789, #1822). This
// Select-based picker enforces the 5-minute grid in the UI itself.
export function TimePicker5Min({
  value,
  onChange,
  className,
  disabled,
  "aria-label": ariaLabel,
}: TimePicker5MinProps) {
  const options = useMemo(() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        opts.push(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        );
      }
    }
    return opts;
  }, []);

  const snapped = (() => {
    if (!value) return "";
    const [h, m] = value.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
    const total = Math.min(Math.max(h * 60 + m, 0), 24 * 60 - 5);
    const grid = Math.min(Math.round(total / 5) * 5, 24 * 60 - 5);
    return `${String(Math.floor(grid / 60)).padStart(2, "0")}:${String(grid % 60).padStart(2, "0")}`;
  })();

  return (
    <Select value={snapped} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn("tabular-nums", className)}
      >
        <SelectValue placeholder="--:--" />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="tabular-nums">
            {opt}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
