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
  onComplete: (fieldValues: Record<string, string>) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LONG_FORM_THRESHOLD = 3;

export function DocumentFormFiller({
  formFields,
  filledByFilter,
  initialValues,
  submitLabel,
  onComplete,
  onCancel,
}: DocumentFormFillerProps) {
  const { t } = useTranslation();

  // Filter fields by filledBy if a filter is specified
  const visibleFields = filledByFilter
    ? formFields.filter((f) => (f.filledBy || "client") === filledByFilter)
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

  const [showErrors, setShowErrors] = useState(false);

  const setValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const isFieldInvalid = (field: (typeof visibleFields)[number]): boolean => {
    if (!field.required) return false;
    const val = values[field.fieldId];
    if (field.fieldType === "checkbox") return val !== "true";
    return !val?.trim();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasInvalid = visibleFields.some(isFieldInvalid);
    if (hasInvalid) {
      setShowErrors(true);
      return;
    }
    onComplete(values);
  };

  const showTopAction = visibleFields.length > LONG_FORM_THRESHOLD;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {showTopAction && (
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

      {visibleFields.map((field) => {
        const invalid = showErrors && isFieldInvalid(field);
        return (
          <div key={field.fieldId} className="space-y-1.5">
            <Label className={cn("text-sm", invalid && "text-destructive")}>
              {field.label || field.fieldId}
              {field.required && <span className="ml-1 text-red-500">*</span>}
            </Label>

            {field.fieldType === "text" && (
              <Input
                value={values[field.fieldId] ?? ""}
                onChange={(e) => setValue(field.fieldId, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                className={cn(invalid && "border-destructive")}
              />
            )}

            {field.fieldType === "textarea" && (
              <Textarea
                value={values[field.fieldId] ?? ""}
                onChange={(e) => setValue(field.fieldId, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                rows={3}
                className={cn(invalid && "border-destructive")}
              />
            )}

            {field.fieldType === "select" && (
              <Select
                value={values[field.fieldId] ?? ""}
                onValueChange={(v) => setValue(field.fieldId, v)}
              >
                <SelectTrigger className={cn(invalid && "border-destructive")}>
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
                className={cn(invalid && "border-destructive")}
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
              <div className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                invalid && "bg-destructive/5 ring-1 ring-destructive/30 rounded-md",
              )}>
                <Switch
                  checked={values[field.fieldId] === "true"}
                  onCheckedChange={(v) =>
                    setValue(field.fieldId, v ? "true" : "false")
                  }
                />
                <span className={cn(
                  "text-sm",
                  invalid ? "text-destructive" : "text-muted-foreground",
                )}>
                  {field.placeholder || field.label}
                </span>
              </div>
            )}

            {invalid && field.fieldType !== "checkbox" && (
              <p className="text-xs text-destructive">
                {t("common.fieldRequired", "To pole jest wymagane.")}
              </p>
            )}
          </div>
        );
      })}

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
