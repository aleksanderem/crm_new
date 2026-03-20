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
import type { ExtractedFormField } from "@/components/documents/document-renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentFormFillerProps {
  formFields: ExtractedFormField[];
  onComplete: (fieldValues: Record<string, string>) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentFormFiller({
  formFields,
  onComplete,
  onCancel,
}: DocumentFormFillerProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const field of formFields) {
      init[field.fieldId] = field.fieldType === "checkbox" ? "false" : "";
    }
    return init;
  });

  const setValue = (fieldId: string, value: string) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate required fields
    for (const field of formFields) {
      if (field.required && !values[field.fieldId]?.trim()) {
        return;
      }
    }
    onComplete(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          "documentEditor.fillFields",
          "Uzupełnij pola formularza przed wygenerowaniem dokumentu.",
        )}
      </p>

      {formFields.map((field) => (
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
          {t("documentEditor.generate", "Generuj dokument")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel", "Anuluj")}
        </Button>
      </div>
    </form>
  );
}
