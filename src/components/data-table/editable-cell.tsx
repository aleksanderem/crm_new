import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type FocusEvent } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Inplace } from "@/components/ui/inplace";
import { cn } from "@/lib/utils";

export type EditableCellType = "text" | "number" | "select" | "date" | "time" | "datetime" | "boolean";

export interface EditableCellConfig {
  type: EditableCellType;
  options?: { label: string; value: string }[];
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  validate?: (value: any) => string | null;
}

interface EditableCellProps {
  value: any;
  onChange: (value: any) => Promise<void> | void;
  config: EditableCellConfig;
  className?: string;
  disabled?: boolean;
  displayFormatter?: (value: any) => string;
}

export function EditableCell({
  value,
  onChange,
  config,
  className,
  disabled = false,
  displayFormatter,
}: EditableCellProps) {
  const [active, setActive] = useState(false);
  const [editValue, setEditValue] = useState<any>(value);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLButtonElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (!active) return;
    if (config.type === "boolean") {
      // Boolean: toggle immediately, no edit mode
      handleSave(!value);
      return;
    }
    if (config.type === "select") {
      selectRef.current?.focus();
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [active]);

  const handleActiveChange = useCallback(
    (e: { active: boolean }) => {
      if (e.active) {
        setEditValue(value);
        setErrorMessage(null);
      }
      setActive(e.active);
    },
    [value]
  );

  const handleSave = async (newValue?: any) => {
    const v = newValue !== undefined ? newValue : editValue;

    if (config.required && (v === "" || v == null)) {
      setErrorMessage("Required");
      return;
    }
    if (config.validate) {
      const err = config.validate(v);
      if (err) { setErrorMessage(err); return; }
    }
    if (v === value) { setActive(false); return; }

    setSaving(true);
    try {
      await onChange(v);
      setErrorMessage(null);
      setActive(false);
    } catch (e: any) {
      setErrorMessage(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
    else if (e.key === "Escape") { e.preventDefault(); setActive(false); }
  };

  const handleBlur = (e: FocusEvent) => {
    const related = e.relatedTarget as HTMLElement;
    if (!related || !e.currentTarget.contains(related)) {
      handleSave();
    }
  };

  // --- Display value ---
  const getDisplayContent = () => {
    if (config.type === "boolean") {
      return (
        <Checkbox
          checked={!!value}
          onCheckedChange={(checked) => { if (!disabled) handleSave(checked); }}
          disabled={disabled}
        />
      );
    }

    let text: string;
    if (displayFormatter) {
      text = displayFormatter(value);
    } else {
      switch (config.type) {
        case "select": {
          const opt = config.options?.find((o) => o.value === value);
          text = opt?.label ?? value ?? "";
          break;
        }
        case "date":
          text = value ? new Date(value).toLocaleDateString() : "";
          break;
        case "datetime":
          text = value ? new Date(value).toLocaleString() : "";
          break;
        default:
          text = value?.toString() ?? "";
      }
    }

    return (
      <span className={cn("text-sm", !text && "text-muted-foreground")}>
        {text || config.placeholder || "—"}
      </span>
    );
  };

  // --- Edit input ---
  const getEditContent = () => {
    const inputProps = {
      onKeyDown: handleKeyDown,
      onBlur: handleBlur,
      disabled: saving,
      className: "h-8",
    };

    switch (config.type) {
      case "text":
        return (
          <Input ref={inputRef} value={editValue ?? ""} onChange={(e) => setEditValue(e.target.value)}
            placeholder={config.placeholder} {...inputProps} />
        );
      case "number":
        return (
          <Input ref={inputRef} type="number" value={editValue ?? ""} onChange={(e) => setEditValue(e.target.valueAsNumber || "")}
            min={config.min} max={config.max} step={config.step} placeholder={config.placeholder} {...inputProps} />
        );
      case "date":
        return (
          <Input ref={inputRef} type="date" value={editValue ?? ""} onChange={(e) => setEditValue(e.target.value)} {...inputProps} />
        );
      case "time":
        return (
          <Input ref={inputRef} type="time" value={editValue ?? ""} onChange={(e) => setEditValue(e.target.value)} {...inputProps} />
        );
      case "datetime":
        return (
          <Input ref={inputRef} type="datetime-local" value={editValue ?? ""} onChange={(e) => setEditValue(e.target.value)} {...inputProps} />
        );
      case "select":
        return (
          <Select value={editValue ?? ""} onValueChange={(v) => { setEditValue(v); handleSave(v); }} disabled={saving}>
            <SelectTrigger ref={selectRef} className="h-8">
              <SelectValue placeholder={config.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {config.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  // Boolean doesn't use Inplace (just a checkbox)
  if (config.type === "boolean") {
    return <div onClick={(e) => e.stopPropagation()}>{getDisplayContent()}</div>;
  }

  return (
    <Inplace.Root active={active} onActiveChange={handleActiveChange} disabled={disabled} className={className}>
      <Inplace.Display className={cn(errorMessage && "border border-destructive")}>
        {getDisplayContent()}
      </Inplace.Display>
      <Inplace.Content>
        <div onBlur={handleBlur}>
          {getEditContent()}
          {saving && <span className="text-xs text-muted-foreground animate-pulse ml-1">...</span>}
        </div>
      </Inplace.Content>
      {errorMessage && (
        <div className="absolute top-full left-0 mt-1 text-xs text-destructive z-10 bg-background px-2 py-1 rounded border border-destructive shadow-sm">
          {errorMessage}
        </div>
      )}
    </Inplace.Root>
  );
}
