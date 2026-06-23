import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ExtractedFormField } from "@/components/documents/document-renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentFormFillerProps {
  formFields: ExtractedFormField[];
  filledByFilter?: "employee" | "client";
  initialValues?: Record<string, string>;
  submitLabel?: string;
  hideTopAction?: boolean;
  onComplete: (fieldValues: Record<string, string>) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentFormFiller({
  formFields,
  filledByFilter,
  initialValues,
  submitLabel,
  hideTopAction = false,
  onComplete,
  onCancel,
}: DocumentFormFillerProps) {
  const { t } = useTranslation();

  // Filter fields by filledBy if a filter is specified
  const visibleFields = filledByFilter
    ? formFields.filter((f) => (f.filledBy || "employee") === filledByFilter)
    : formFields;

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const field of visibleFields) {
      const existing = initialValues?.[field.fieldId];
      if (existing !== undefined && existing !== null) {
        init[field.fieldId] = existing;
      } else {
        init[field.fieldId] = field.fieldType === "checkbox" ? "false" : "";
      }
    }
    return init;
  });

  const setValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required visible fields. Checkboxes require an explicit "true"
    // value — checking !value.trim() would wrongly pass for "false" (unchecked).
    for (const field of visibleFields) {
      if (!field.required) continue;
      const val = values[field.fieldId];
      if (field.fieldType === "checkbox") {
        if (val !== "true") return;
      } else if (!val?.trim()) {
        return;
      }
    }
    onComplete(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!hideTopAction && (
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">
            {submitLabel ?? t("documentEditor.generate", "Generuj dokument")}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel", "Anuluj")}
          </Button>
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        {t(
          "documentEditor.fillFields",
          "Uzupełnij pola formularza przed wygenerowaniem dokumentu.",
        )}
      </p>

      {visibleFields.map((field) => (
        <div key={field.fieldId} className="space-y-1.5">
          <Label className="text-sm">
            {field.label || field.fieldId}
            {field.required && <span className="ml-1 text-red-500">*</span>}
          </Label>

          {field.fieldType === "text" && (
            <Input
              value={values[field.fieldId] ?? ""}
              onChange={(e) => setValue(field.fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          )}

          {field.fieldType === "textarea" && (
            <Textarea
              value={values[field.fieldId] ?? ""}
              onChange={(e) => setValue(field.fieldId, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={3}
            />
          )}

          {field.fieldType === "select" && (
            <Select
              value={values[field.fieldId] ?? ""}
              onValueChange={(v) => setValue(field.fieldId, v)}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    field.placeholder ||
                    t("common.select", "Wybierz...")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {field.options
                  .split(",")
                  .map((opt) => opt.trim())
                  .filter(Boolean)
                  .map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}

          {field.fieldType === "date" && (
            <Input
              type="date"
              value={values[field.fieldId] ?? ""}
              onChange={(e) => setValue(field.fieldId, e.target.value)}
              required={field.required}
            />
          )}

          {field.fieldType === "button_select" && (
            <div className="flex flex-wrap gap-2">
              {field.options
                .split(",")
                .map((opt) => opt.trim())
                .filter(Boolean)
                .map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setValue(field.fieldId, opt)}
                    className={cn(
                      "min-h-[44px] rounded-lg border-2 px-5 py-2.5 text-sm font-medium transition-colors",
                      values[field.fieldId] === opt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-foreground hover:border-primary/50",
                    )}
                  >
                    {opt}
                  </button>
                ))}
            </div>
          )}

          {field.fieldType === "checkbox" && (
            <div className="flex items-center gap-2">
              <Switch
                checked={values[field.fieldId] === "true"}
                onCheckedChange={(v) =>
                  setValue(field.fieldId, v ? "true" : "false")
                }
              />
              <span className="text-sm text-muted-foreground">
                {field.placeholder || field.label}
              </span>
            </div>
          )}
        </div>
      ))}

      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1">
          {submitLabel ?? t("documentEditor.generate", "Generuj dokument")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel", "Anuluj")}
        </Button>
      </div>
    </form>
  );
}
