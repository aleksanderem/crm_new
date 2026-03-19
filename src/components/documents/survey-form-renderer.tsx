import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Template } from "@pdfme/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  VARIABLE_REGISTRY,
  CATEGORY_LABELS,
  type VariableField,
} from "@/lib/pdfme/variables";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfmeFormRendererProps {
  templateJson: string;
  prefilledData?: Record<string, string>;
  onComplete?: (data: Record<string, string>) => void;
}

// Keep old prop interface name for backward-compat re-export
interface SurveyFormRendererProps {
  formJson: string;
  prefilledData?: Record<string, unknown>;
  readOnly?: boolean;
  onComplete?: (data: Record<string, unknown>) => void;
  onChange?: (data: Record<string, unknown>) => void;
}

// ---------------------------------------------------------------------------
// Field extraction from PDFme template
// ---------------------------------------------------------------------------

interface ExtractedField {
  name: string;
  label: string;
  labelEn: string;
  category: string;
  inputType: "text" | "textarea" | "email" | "tel" | "date";
  defaultContent: string;
}

/** Build a lookup map from the VARIABLE_REGISTRY for O(1) label resolution */
function buildVariableLookup(): Map<string, VariableField> {
  const map = new Map<string, VariableField>();
  for (const vars of Object.values(VARIABLE_REGISTRY)) {
    for (const v of vars) {
      map.set(v.path, v);
    }
  }
  return map;
}

const variableLookup = buildVariableLookup();

/** Fallback label generator for paths not in the registry */
function fallbackLabel(path: string): string {
  // "patient.firstName" → "firstName" → "First Name" → "First name"
  const parts = path.split(".");
  const fieldPart = parts[parts.length - 1];
  return fieldPart
    .replace(/([A-Z])/g, " $1")
    .replace(/[._-]/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/** Infer input type from the field name and schema properties */
function inferInputType(
  name: string,
  height?: number,
): ExtractedField["inputType"] {
  const lower = name.toLowerCase();
  if (height && height > 15) return "textarea";
  if (
    lower.includes("email") ||
    lower.endsWith(".email")
  )
    return "email";
  if (
    lower.includes("phone") ||
    lower.includes("telefon") ||
    lower.endsWith(".phone")
  )
    return "tel";
  if (
    lower.includes("date") ||
    lower.includes("dateofbirth") ||
    lower.endsWith(".duedate") ||
    lower === "system.today" ||
    lower === "system.date_pl"
  )
    return "text"; // dates come pre-formatted as strings from scope resolver
  return "text";
}

/** Extract editable variable fields from a PDFme template JSON */
function extractFields(template: Template): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const seen = new Set<string>();

  for (const page of template.schemas) {
    for (const schema of page) {
      const s = schema as Record<string, unknown>;
      const name = s.name as string | undefined;
      if (!name || seen.has(name)) continue;

      // Only include variable fields (dot-notation paths)
      if (!name.includes(".")) continue;
      // Skip separator/label-only fields
      if (name.startsWith("separator") || name.endsWith("_label")) continue;

      seen.add(name);

      const registryVar = variableLookup.get(name);
      const height = s.height as number | undefined;

      fields.push({
        name,
        label: registryVar?.label ?? fallbackLabel(name),
        labelEn: registryVar?.labelEn ?? fallbackLabel(name),
        category: registryVar?.category ?? name.split(".")[0],
        inputType: inferInputType(name, height),
        defaultContent: (s.content as string) ?? "",
      });
    }
  }

  return fields;
}

interface FieldGroup {
  category: string;
  labelPl: string;
  labelEn: string;
  fields: ExtractedField[];
}

/** Group fields by category, preserving template order within groups */
function groupFields(fields: ExtractedField[]): FieldGroup[] {
  const groupMap = new Map<string, ExtractedField[]>();
  const order: string[] = [];

  for (const field of fields) {
    if (!groupMap.has(field.category)) {
      groupMap.set(field.category, []);
      order.push(field.category);
    }
    groupMap.get(field.category)!.push(field);
  }

  return order.map((cat) => ({
    category: cat,
    labelPl: CATEGORY_LABELS[cat]?.pl ?? cat,
    labelEn: CATEGORY_LABELS[cat]?.en ?? cat,
    fields: groupMap.get(cat)!,
  }));
}

// ---------------------------------------------------------------------------
// Component — renders a standard React form from PDFme template fields
// ---------------------------------------------------------------------------

export function PdfmeFormRenderer({
  templateJson,
  prefilledData,
  onComplete,
}: PdfmeFormRendererProps) {
  const { i18n } = useTranslation();
  const isPl = i18n.language?.startsWith("pl") ?? true;

  const { groups, initialValues } = useMemo(() => {
    let template: Template;
    try {
      template = JSON.parse(templateJson) as Template;
    } catch {
      return { groups: [] as FieldGroup[], initialValues: {} as Record<string, string> };
    }

    const extracted = extractFields(template);
    const grouped = groupFields(extracted);

    // Build initial values: prefilled data takes priority, then template content
    const vals: Record<string, string> = {};
    for (const field of extracted) {
      const prefilled = prefilledData?.[field.name];
      vals[field.name] =
        prefilled !== undefined && prefilled !== ""
          ? prefilled
          : field.defaultContent.startsWith("[")
            ? "" // placeholder like "[Imię pacjenta]" should be empty
            : field.defaultContent;
    }

    return { groups: grouped, initialValues: vals };
  }, [templateJson, prefilledData]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      onComplete?.(values);
    },
    [onComplete, values],
  );

  if (groups.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {isPl
          ? "Brak pol do wypelnienia w tym szablonie."
          : "No fillable fields in this template."}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-4">
      {groups.map((group, gi) => (
        <div key={group.category}>
          {gi > 0 && <Separator className="mb-6" />}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              {isPl ? group.labelPl : group.labelEn}
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {group.fields.map((field) => {
              const value = values[field.name] ?? "";
              const isPrefilled =
                prefilledData?.[field.name] !== undefined &&
                prefilledData[field.name] !== "";
              const isEmpty = !value;

              return (
                <div
                  key={field.name}
                  className={cn(
                    "space-y-1.5 rounded-md border p-3",
                    isPrefilled && "border-l-4 border-l-blue-400/60 bg-blue-50/30 dark:bg-blue-950/10",
                    !isPrefilled && isEmpty && "border-l-4 border-l-amber-400/60 bg-amber-50/20 dark:bg-amber-950/10",
                    !isPrefilled && !isEmpty && "border-muted",
                    field.inputType === "textarea" && "sm:col-span-2",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`field-${field.name}`}
                      className="text-xs font-medium"
                    >
                      {isPl ? field.label : field.labelEn}
                    </Label>
                    {isPrefilled && (
                      <Badge
                        variant="secondary"
                        className="h-4 px-1.5 text-[10px] font-normal"
                      >
                        Auto
                      </Badge>
                    )}
                  </div>
                  {field.inputType === "textarea" ? (
                    <Textarea
                      id={`field-${field.name}`}
                      value={value}
                      onChange={(e) =>
                        handleChange(field.name, e.target.value)
                      }
                      rows={3}
                      className="text-sm"
                      placeholder={isPl ? field.label : field.labelEn}
                    />
                  ) : (
                    <Input
                      id={`field-${field.name}`}
                      type={field.inputType}
                      value={value}
                      onChange={(e) =>
                        handleChange(field.name, e.target.value)
                      }
                      className="text-sm"
                      placeholder={isPl ? field.label : field.labelEn}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {onComplete && (
        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit">
            {isPl ? "Wygeneruj dokument" : "Generate document"}
          </Button>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Backward-compatible wrapper that maps old SurveyJS prop names to PDFme
// ---------------------------------------------------------------------------

export function SurveyFormRenderer({
  formJson,
  prefilledData,
  readOnly: _readOnly,
  onComplete,
  onChange: _onChange,
}: SurveyFormRendererProps) {
  // Convert Record<string, unknown> prefilled data to Record<string, string>
  const stringPrefilled = prefilledData
    ? Object.fromEntries(
        Object.entries(prefilledData).map(([k, v]) => [k, String(v ?? "")]),
      )
    : undefined;

  const handleComplete = useCallback(
    (data: Record<string, string>) => {
      if (onComplete) {
        // Return as Record<string, unknown> to match old interface
        onComplete(data as Record<string, unknown>);
      }
    },
    [onComplete],
  );

  return (
    <PdfmeFormRenderer
      templateJson={formJson}
      prefilledData={stringPrefilled}
      onComplete={onComplete ? handleComplete : undefined}
    />
  );
}

export type { PdfmeFormRendererProps, SurveyFormRendererProps };
