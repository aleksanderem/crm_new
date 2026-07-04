import { forwardRef, useMemo } from "react";

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
  id?: string;
  stepMinutes?: number;
  "aria-label"?: string;
  allowTyping?: boolean;
}

// `<input type="time" step={300}>` shows a per-minute wheel on iOS Safari
// because iOS ignores the step attribute on time inputs (#1789, #1822, #1827).
// This Select-based picker enforces the configured grid in the UI itself.
function snapToGrid(raw: string, step: number): string {
  const [h, m] = raw.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const total = Math.min(Math.max(h * 60 + m, 0), 24 * 60 - step);
  const grid = Math.min(Math.round(total / step) * step, 24 * 60 - step);
  return `${String(Math.floor(grid / 60)).padStart(2, "0")}:${String(grid % 60).padStart(2, "0")}`;
}

export const TimePicker5Min = forwardRef<HTMLButtonElement, TimePicker5MinProps>(
  function TimePicker5Min(
    {
      value,
      onChange,
      className,
      disabled,
      id,
      stepMinutes = 5,
      "aria-label": ariaLabel,
      allowTyping = false,
    },
    ref,
  ) {
    const step = stepMinutes > 0 ? stepMinutes : 5;

    const options = useMemo(() => {
      const opts: string[] = [];
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += step) {
          opts.push(
            `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          );
        }
      }
      return opts;
    }, [step]);

    const snapped = (() => {
      if (!value) return "";
      return snapToGrid(value, step);
    })();

    if (allowTyping) {
      return (
        <input
          type="time"
          id={id}
          step={step * 60}
          value={snapped}
          onChange={(e) => {
            const raw = e.target.value;
            if (!raw) return;
            const s = snapToGrid(raw, step);
            if (s) onChange(s);
          }}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "flex rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums",
            "focus-visible:outline-none focus-visible:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        />
      );
    }

    return (
      <Select value={snapped} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          ref={ref}
          id={id}
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
  },
);
