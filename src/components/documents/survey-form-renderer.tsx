import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Template } from "@pdfme/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollShadow } from "@heroui/scroll-shadow";
import { cn } from "@/lib/utils";
import {
  User,
  Mail,
  Building2,
  Calendar,
  Stethoscope,
  Briefcase,
  Contact,
  ClipboardList,
  HeartPulse,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Pencil,
} from "@/lib/ez-icons";
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
  if (lower.includes("email") || lower.endsWith(".email")) return "email";
  if (
    lower.includes("phone") ||
    lower.includes("telefon") ||
    lower.endsWith(".phone")
  )
    return "tel";
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

// ---------------------------------------------------------------------------
// Category icon mapping
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  patient: User,
  contact: Contact,
  treatment: HeartPulse,
  employee: Stethoscope,
  organization: Building2,
  appointment: Calendar,
  system: ClipboardList,
  lead: Briefcase,
  company: Building2,
};

function getCategoryIcon(category: string) {
  return CATEGORY_ICONS[category] ?? ClipboardList;
}

// ---------------------------------------------------------------------------
// Summary item: a single auto-filled value displayed in the info card
// ---------------------------------------------------------------------------

interface SummaryItem {
  label: string;
  value: string;
  category: string;
}

/** Pick the most recognizable summary items from auto-filled fields */
function pickSummaryItems(
  autoFilledFields: ExtractedField[],
  values: Record<string, string>,
  isPl: boolean,
): SummaryItem[] {
  // Priority paths for the summary card — the most useful at-a-glance data
  const priorityPaths = [
    "patient.firstName",
    "patient.lastName",
    "contact.firstName",
    "contact.lastName",
    "patient.email",
    "contact.email",
    "patient.phone",
    "contact.phone",
    "treatment.name",
    "employee.firstName",
    "employee.lastName",
    "organization.name",
    "system.date_pl",
    "system.today",
    "appointment.date",
    "lead.title",
    "company.name",
  ];

  // Merge first+last names into a single display value
  const nameKeys: Record<string, { first: string; last: string; label: string; labelEn: string; category: string }> = {
    patient: { first: "patient.firstName", last: "patient.lastName", label: "Pacjent", labelEn: "Patient", category: "patient" },
    contact: { first: "contact.firstName", last: "contact.lastName", label: "Kontakt", labelEn: "Contact", category: "contact" },
    employee: { first: "employee.firstName", last: "employee.lastName", label: "Lekarz", labelEn: "Doctor", category: "employee" },
  };

  const items: SummaryItem[] = [];
  const usedPaths = new Set<string>();

  // First pass: merged names
  for (const [, cfg] of Object.entries(nameKeys)) {
    const first = values[cfg.first]?.trim();
    const last = values[cfg.last]?.trim();
    if (first || last) {
      items.push({
        label: isPl ? cfg.label : cfg.labelEn,
        value: [first, last].filter(Boolean).join(" "),
        category: cfg.category,
      });
      usedPaths.add(cfg.first);
      usedPaths.add(cfg.last);
    }
  }

  // Second pass: other priority fields
  for (const path of priorityPaths) {
    if (usedPaths.has(path)) continue;
    const val = values[path]?.trim();
    if (!val) continue;
    const field = autoFilledFields.find((f) => f.name === path);
    if (!field) continue;
    items.push({
      label: isPl ? field.label : field.labelEn,
      value: val,
      category: field.category,
    });
    usedPaths.add(path);
    if (items.length >= 8) break;
  }

  // Third pass: fill remaining slots with any auto-filled field
  if (items.length < 6) {
    for (const field of autoFilledFields) {
      if (usedPaths.has(field.name)) continue;
      if (field.category === "system") continue;
      const val = values[field.name]?.trim();
      if (!val) continue;
      items.push({
        label: isPl ? field.label : field.labelEn,
        value: val,
        category: field.category,
      });
      usedPaths.add(field.name);
      if (items.length >= 8) break;
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Component — polished medical form renderer
// ---------------------------------------------------------------------------

export function PdfmeFormRenderer({
  templateJson,
  prefilledData,
  onComplete,
}: PdfmeFormRendererProps) {
  const { t, i18n } = useTranslation();
  const isPl = i18n.language?.startsWith("pl") ?? true;

  // Parse template and classify fields
  const { allFields, autoFilledFields, missingFields, initialValues } = useMemo(() => {
    let template: Template;
    try {
      template = JSON.parse(templateJson) as Template;
    } catch {
      return {
        allFields: [] as ExtractedField[],
        autoFilledFields: [] as ExtractedField[],
        missingFields: [] as ExtractedField[],
        initialValues: {} as Record<string, string>,
      };
    }

    const extracted = extractFields(template);

    const vals: Record<string, string> = {};
    const autoFilled: ExtractedField[] = [];
    const missing: ExtractedField[] = [];

    for (const field of extracted) {
      const prefilled = prefilledData?.[field.name];
      const hasValue = prefilled !== undefined && prefilled !== "";
      vals[field.name] = hasValue
        ? prefilled
        : field.defaultContent.startsWith("[")
          ? ""
          : field.defaultContent;

      if (hasValue) {
        autoFilled.push(field);
      } else if (!vals[field.name]) {
        missing.push(field);
      } else {
        // Has a default value from template — treat as auto-filled
        autoFilled.push(field);
      }
    }

    return {
      allFields: extracted,
      autoFilledFields: autoFilled,
      missingFields: missing,
      initialValues: vals,
    };
  }, [templateJson, prefilledData]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [showAllSummary, setShowAllSummary] = useState(false);
  const [showAutoEditable, setShowAutoEditable] = useState(false);

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

  // Count fields for the status bar
  const filledCount = allFields.filter(
    (f) => (values[f.name] ?? "").trim() !== "",
  ).length;
  const totalCount = allFields.length;
  const missingCount = totalCount - filledCount;
  const requiredMissing = missingFields.filter(
    (f) => (values[f.name] ?? "").trim() === "",
  ).length;

  // Summary items for the info card
  const summaryItems = useMemo(
    () => pickSummaryItems(autoFilledFields, values, isPl),
    [autoFilledFields, values, isPl],
  );
  const visibleSummaryCount = 6;
  const displayedSummary = showAllSummary
    ? summaryItems
    : summaryItems.slice(0, visibleSummaryCount);

  // Group missing fields by category for organized display
  const missingByCategory = useMemo(() => {
    const groups: { category: string; fields: ExtractedField[] }[] = [];
    const catMap = new Map<string, ExtractedField[]>();
    const order: string[] = [];
    for (const field of missingFields) {
      if (!catMap.has(field.category)) {
        catMap.set(field.category, []);
        order.push(field.category);
      }
      catMap.get(field.category)!.push(field);
    }
    for (const cat of order) {
      groups.push({ category: cat, fields: catMap.get(cat)! });
    }
    return groups;
  }, [missingFields]);

  // Group auto-filled (editable) fields by category
  const autoByCategory = useMemo(() => {
    const groups: { category: string; fields: ExtractedField[] }[] = [];
    const catMap = new Map<string, ExtractedField[]>();
    const order: string[] = [];
    for (const field of autoFilledFields) {
      if (field.category === "system") continue; // system fields hidden from editing
      if (!catMap.has(field.category)) {
        catMap.set(field.category, []);
        order.push(field.category);
      }
      catMap.get(field.category)!.push(field);
    }
    for (const cat of order) {
      groups.push({ category: cat, fields: catMap.get(cat)! });
    }
    return groups;
  }, [autoFilledFields]);

  // Empty state
  if (allFields.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {isPl
          ? "Brak pol do wypelnienia w tym szablonie."
          : "No fillable fields in this template."}
      </div>
    );
  }

  const allAutoFilled = missingFields.length === 0;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <ScrollShadow className="flex-1 overflow-y-auto space-y-5 p-4 pb-24">
        {/* ================================================================
            SECTION A: Auto-filled summary card
            ================================================================ */}
        {autoFilledFields.length > 0 && (
          <div className="rounded-lg border bg-muted/40 dark:bg-muted/20">
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" variant="stroke" />
              <span className="text-xs font-medium text-muted-foreground">
                {isPl
                  ? "Dane wypelnione automatycznie"
                  : "Auto-filled data"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground/70">
                {autoFilledFields.length}{" "}
                {isPl
                  ? (autoFilledFields.length === 1 ? "pole" : "pol")
                  : (autoFilledFields.length === 1 ? "field" : "fields")}
              </span>
            </div>

            <div className="px-4 pb-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {displayedSummary.map((item) => {
                  const Icon = getCategoryIcon(item.category);
                  return (
                    <div
                      key={`${item.category}-${item.label}`}
                      className="min-w-0"
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Icon className="h-3 w-3 shrink-0 text-muted-foreground/50" variant="stroke" />
                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                          {item.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate pl-[18px]">
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </div>

              {summaryItems.length > visibleSummaryCount && (
                <button
                  type="button"
                  onClick={() => setShowAllSummary((v) => !v)}
                  className="mt-2 flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  {showAllSummary ? (
                    <>
                      <ChevronDown className="h-3 w-3" variant="stroke" />
                      {isPl ? "Pokaz mniej" : "Show less"}
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-3 w-3" variant="stroke" />
                      {isPl
                        ? `Pokaz wszystkie (${summaryItems.length})`
                        : `Show all (${summaryItems.length})`}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ================================================================
            SECTION B: All auto-filled — approval message
            ================================================================ */}
        {allAutoFilled && (
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 p-1.5 mt-0.5">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" variant="stroke" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                  {isPl
                    ? "Wszystkie dane zostaly wypelnione automatycznie"
                    : "All data has been auto-filled"}
                </p>
                <p className="text-xs text-emerald-700/70 dark:text-emerald-400/60 mt-0.5">
                  {isPl
                    ? "Przejrzyj dane ponizej i zatwierdz generowanie dokumentu."
                    : "Review the data below and confirm document generation."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================
            SECTION C: Missing fields — user needs to fill these
            ================================================================ */}
        {missingFields.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-500" variant="stroke" />
              <h3 className="text-sm font-semibold text-foreground">
                {isPl
                  ? `Uzupelnij brakujace dane (${missingFields.length} ${missingFields.length === 1 ? "pole" : "pol"})`
                  : `Fill in missing data (${missingFields.length} ${missingFields.length === 1 ? "field" : "fields"})`}
              </h3>
            </div>

            <div className="space-y-4">
              {missingByCategory.map((group) => {
                const Icon = getCategoryIcon(group.category);
                const catLabel =
                  CATEGORY_LABELS[group.category]?.[isPl ? "pl" : "en"] ??
                  group.category;
                const shortFields = group.fields.filter(
                  (f) => f.inputType !== "textarea",
                );
                const longFields = group.fields.filter(
                  (f) => f.inputType === "textarea",
                );

                return (
                  <div key={group.category} className="space-y-3">
                    {missingByCategory.length > 1 && (
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" variant="stroke" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {catLabel}
                        </span>
                      </div>
                    )}

                    {/* Short fields in two-column grid */}
                    {shortFields.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {shortFields.map((field) => (
                          <FieldInput
                            key={field.name}
                            field={field}
                            value={values[field.name] ?? ""}
                            onChange={handleChange}
                            isPl={isPl}
                          />
                        ))}
                      </div>
                    )}

                    {/* Long fields full-width */}
                    {longFields.map((field) => (
                      <FieldInput
                        key={field.name}
                        field={field}
                        value={values[field.name] ?? ""}
                        onChange={handleChange}
                        isPl={isPl}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================
            SECTION D: Editable auto-filled fields (collapsed by default)
            ================================================================ */}
        {autoByCategory.length > 0 && (
          <div>
            <Separator className="mb-4" />
            <button
              type="button"
              onClick={() => setShowAutoEditable((v) => !v)}
              className="flex items-center gap-2 w-full text-left group mb-3"
            >
              <Pencil className="h-3.5 w-3.5 text-muted-foreground/60" variant="stroke" />
              <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {isPl
                  ? "Dane automatyczne (edytuj jesli potrzeba)"
                  : "Auto-filled data (edit if needed)"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground/50">
                {autoFilledFields.filter((f) => f.category !== "system").length}{" "}
                {isPl ? "pol" : "fields"}
              </span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200",
                  showAutoEditable && "rotate-180",
                )}
              />
            </button>

            {showAutoEditable && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                {autoByCategory.map((group) => {
                  const Icon = getCategoryIcon(group.category);
                  const catLabel =
                    CATEGORY_LABELS[group.category]?.[isPl ? "pl" : "en"] ??
                    group.category;
                  const shortFields = group.fields.filter(
                    (f) => f.inputType !== "textarea",
                  );
                  const longFields = group.fields.filter(
                    (f) => f.inputType === "textarea",
                  );

                  return (
                    <div key={group.category} className="space-y-3">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <span className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                          {catLabel}
                        </span>
                      </div>

                      {shortFields.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {shortFields.map((field) => (
                            <FieldInput
                              key={field.name}
                              field={field}
                              value={values[field.name] ?? ""}
                              onChange={handleChange}
                              isPl={isPl}
                              subtle
                            />
                          ))}
                        </div>
                      )}

                      {longFields.map((field) => (
                        <FieldInput
                          key={field.name}
                          field={field}
                          value={values[field.name] ?? ""}
                          onChange={handleChange}
                          isPl={isPl}
                          subtle
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </ScrollShadow>

      {/* ==================================================================
          SECTION E: Sticky submit footer
          ================================================================== */}
      {onComplete && (
        <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur-sm px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {isPl
                ? `${filledCount} pol wypelnionych`
                : `${filledCount} fields filled`}
              {missingCount > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {" "}
                  {isPl
                    ? `, ${missingCount} do uzupelnienia`
                    : `, ${missingCount} to fill`}
                </span>
              )}
            </p>
            <Button
              type="submit"
              disabled={requiredMissing > 0}
              className="shrink-0"
            >
              {isPl ? "Wygeneruj dokument" : "Generate document"}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// FieldInput — a single form field with label
// ---------------------------------------------------------------------------

function FieldInput({
  field,
  value,
  onChange,
  isPl,
  subtle = false,
}: {
  field: ExtractedField;
  value: string;
  onChange: (name: string, value: string) => void;
  isPl: boolean;
  subtle?: boolean;
}) {
  const label = isPl ? field.label : field.labelEn;
  const placeholder = isPl
    ? `Wpisz ${label.toLowerCase()}...`
    : `Enter ${label.toLowerCase()}...`;

  return (
    <div
      className={cn(
        "space-y-2",
        field.inputType === "textarea" && "sm:col-span-2",
      )}
    >
      <Label
        htmlFor={`field-${field.name}`}
        className={cn(
          "text-xs font-medium",
          subtle && "text-muted-foreground/80",
        )}
      >
        {label}
      </Label>
      {field.inputType === "textarea" ? (
        <Textarea
          id={`field-${field.name}`}
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
          rows={3}
          className={cn("text-sm", subtle && "border-muted bg-muted/30")}
          placeholder={placeholder}
        />
      ) : (
        <Input
          id={`field-${field.name}`}
          type={field.inputType}
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
          className={cn("text-sm", subtle && "border-muted bg-muted/30")}
          placeholder={placeholder}
        />
      )}
    </div>
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
  const stringPrefilled = prefilledData
    ? Object.fromEntries(
        Object.entries(prefilledData).map(([k, v]) => [k, String(v ?? "")]),
      )
    : undefined;

  const handleComplete = useCallback(
    (data: Record<string, string>) => {
      if (onComplete) {
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
