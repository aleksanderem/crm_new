import { useState, useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X } from "@/lib/ez-icons";
import type { DataSourceInfo, FieldBinding } from "@/lib/document-data-sources";

export interface SourceFieldPickerProps {
  sources: DataSourceInfo[];
  value: FieldBinding | null;
  onChange: (binding: FieldBinding | null) => void;
}

export function SourceFieldPicker({
  sources,
  value,
  onChange,
}: SourceFieldPickerProps) {
  // Track the source selection independently so the field dropdown appears
  // before the user commits a full binding (source + field).
  const [pendingSource, setPendingSource] = useState<string>(
    value?.source ?? "",
  );

  // Sync pendingSource when value changes externally
  useEffect(() => {
    setPendingSource(value?.source ?? "");
  }, [value?.source]);

  const selectedSource = useMemo(
    () => sources.find((s) => s.key === pendingSource) ?? null,
    [sources, pendingSource],
  );

  function handleSourceChange(sourceKey: string) {
    setPendingSource(sourceKey);
    // Clear the full binding since a new field hasn't been chosen yet
    if (value) {
      onChange(null);
    }
  }

  function handleFieldChange(fieldKey: string) {
    onChange({ source: pendingSource, field: fieldKey });
  }

  function handleClear() {
    setPendingSource("");
    onChange(null);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Zrodlo danych
        </Label>
        <Select value={pendingSource} onValueChange={handleSourceChange}>
          <SelectTrigger size="sm">
            <SelectValue placeholder="Wybierz zrodlo..." />
          </SelectTrigger>
          <SelectContent>
            {sources.map((source) => (
              <SelectItem key={source.key} value={source.key}>
                {source.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedSource && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Pole</Label>
          <Select
            value={value?.field ?? ""}
            onValueChange={handleFieldChange}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Wybierz pole..." />
            </SelectTrigger>
            <SelectContent>
              {selectedSource.fields.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-7 px-2 text-xs text-muted-foreground"
        >
          <X className="mr-1 h-3 w-3" />
          Wyczysc powiazanie
        </Button>
      )}
    </div>
  );
}
