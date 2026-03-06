import { useState, useRef, useEffect, type KeyboardEvent, type FocusEvent, type MouseEvent } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type EditableCellType = "text" | "number" | "select" | "date" | "time" | "datetime" | "boolean";

export interface EditableCellConfig {
  type: EditableCellType;
  options?: { label: string; value: string }[]; // for select type
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  validate?: (value: any) => string | null; // returns error message or null
  displayFormatter?: (value: any) => string; // format display value
}

interface EditableCellProps {
  value: any;
  onChange: (value: any) => Promise<void> | void;
  config: EditableCellConfig;
  className?: string;
  disabled?: boolean;
  displayFormatter?: (value: any) => string;
}

type CellState = "view" | "editing" | "saving" | "error";

export function EditableCell({
  value,
  onChange,
  config,
  className,
  disabled = false,
  displayFormatter,
}: EditableCellProps) {
  const [state, setState] = useState<CellState>("view");
  const [editValue, setEditValue] = useState<any>(value);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state === "editing") {
      if (config.type === "boolean") {
        // Auto-toggle and save for boolean
        handleSave(!value);
      } else if (config.type === "text" || config.type === "number" || config.type === "date" || config.type === "time" || config.type === "datetime") {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else if (config.type === "select") {
        selectRef.current?.focus();
      }
    }
  }, [state, config.type, value]);

  const handleStartEdit = (e: MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setEditValue(value);
    setState("editing");
    setErrorMessage(null);
  };

  const handleSave = async (newValue?: any) => {
    const valueToSave = newValue !== undefined ? newValue : editValue;

    // Validation
    if (config.required && (valueToSave === "" || valueToSave === null || valueToSave === undefined)) {
      setErrorMessage("Required field");
      setState("error");
      return;
    }

    if (config.validate) {
      const error = config.validate(valueToSave);
      if (error) {
        setErrorMessage(error);
        setState("error");
        return;
      }
    }

    // Check if value changed
    if (valueToSave === value) {
      setState("view");
      return;
    }

    // Save
    setState("saving");
    try {
      await onChange(valueToSave);
      setState("view");
      setErrorMessage(null);
    } catch (e: any) {
      setErrorMessage(e.message || "Save failed");
      setState("error");
    }
  };

  const handleCancel = () => {
    setEditValue(value);
    setState("view");
    setErrorMessage(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = (e: FocusEvent) => {
    // Only blur if focus is leaving the cell entirely
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      handleSave();
    }
  };

  const renderEditMode = () => {
    switch (config.type) {
      case "text":
        return (
          <Input
            ref={inputRef}
            value={editValue ?? ""}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={config.placeholder}
            className="h-8"
            disabled={state === "saving"}
          />
        );

      case "number":
        return (
          <Input
            ref={inputRef}
            type="number"
            value={editValue ?? ""}
            onChange={(e) => setEditValue(e.target.valueAsNumber || "")}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={config.placeholder}
            min={config.min}
            max={config.max}
            step={config.step}
            className="h-8"
            disabled={state === "saving"}
          />
        );

      case "date":
        return (
          <Input
            ref={inputRef}
            type="date"
            value={editValue ?? ""}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="h-8"
            disabled={state === "saving"}
          />
        );

      case "time":
        return (
          <Input
            ref={inputRef}
            type="time"
            value={editValue ?? ""}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="h-8"
            disabled={state === "saving"}
          />
        );

      case "datetime":
        return (
          <Input
            ref={inputRef}
            type="datetime-local"
            value={editValue ?? ""}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="h-8"
            disabled={state === "saving"}
          />
        );

      case "select":
        return (
          <Select
            value={editValue ?? ""}
            onValueChange={(v) => {
              setEditValue(v);
              handleSave(v);
            }}
            disabled={state === "saving"}
          >
            <SelectTrigger ref={selectRef} className="h-8">
              <SelectValue placeholder={config.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {config.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "boolean":
        return null; // Boolean is auto-toggle, no edit UI needed

      default:
        return null;
    }
  };

  const renderViewMode = () => {
    let displayValue: string;

    if (displayFormatter) {
      displayValue = displayFormatter(value);
    } else {
      switch (config.type) {
        case "boolean":
          return (
            <Checkbox
              checked={!!value}
              onCheckedChange={(checked) => {
                if (!disabled) {
                  handleSave(checked);
                }
              }}
              disabled={disabled}
            />
          );
        case "select":
          const option = config.options?.find((o) => o.value === value);
          displayValue = option?.label ?? value ?? "";
          break;
        case "date":
          displayValue = value ? new Date(value).toLocaleDateString() : "";
          break;
        case "datetime":
          displayValue = value ? new Date(value).toLocaleString() : "";
          break;
        default:
          displayValue = value?.toString() ?? "";
      }
    }

    return (
      <div
        className={cn(
          "min-h-[2rem] px-2 py-1 rounded cursor-pointer hover:bg-accent transition-colors",
          disabled && "cursor-not-allowed opacity-50",
          state === "error" && "border border-destructive",
          className
        )}
        onClick={handleStartEdit}
      >
        <span className={cn("text-sm", !displayValue && "text-muted-foreground")}>
          {displayValue || config.placeholder || "Click to edit"}
        </span>
      </div>
    );
  };

  if (state === "view" || state === "error") {
    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {renderViewMode()}
        {errorMessage && (
          <div className="absolute top-full left-0 mt-1 text-xs text-destructive z-10 bg-background px-2 py-1 rounded border border-destructive shadow-sm">
            {errorMessage}
          </div>
        )}
      </div>
    );
  }

  if (state === "saving") {
    return (
      <div className="flex items-center gap-2 min-h-[2rem] px-2" onClick={(e) => e.stopPropagation()}>
        {renderEditMode()}
        <span className="text-xs text-muted-foreground animate-pulse">Saving...</span>
      </div>
    );
  }

  return <div onBlur={handleBlur} onClick={(e) => e.stopPropagation()}>{renderEditMode()}</div>;
}
