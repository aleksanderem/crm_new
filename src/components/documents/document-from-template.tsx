import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id, Doc } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, FileText, Eye } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SourceInstancePicker } from "./source-instance-picker";

// --- Types ---

type TemplateField = Doc<"documentTemplateFields">;

interface DocumentFromTemplateProps {
  organizationId: Id<"organizations">;
  templateId: Id<"documentTemplates">;
  sources?: Record<string, string>;
  onComplete?: (instanceId: Id<"documentInstances">) => void;
  onCancel?: () => void;
}

// --- Helpers ---

function renderPreview(
  content: string,
  fieldValues: Record<string, unknown>,
): string {
  const placeholder = (key: string) =>
    `<span style="background:#fef3c7;padding:0 4px;border-radius:2px;color:#92400e">[${key}]</span>`;

  // Handle TipTap mention spans: <span ... data-field="key" ...>Label</span>
  let result = content.replace(
    /<span[^>]*data-field="([^"]+)"[^>]*>[^<]*<\/span>/g,
    (_match, key) => {
      const val = fieldValues[key];
      if (val == null || val === "") return placeholder(key);
      return String(val);
    },
  );
  // Also handle raw {{field:key}} placeholders
  result = result.replace(/\{\{field:(\w+)\}\}/g, (_match, key) => {
    const val = fieldValues[key];
    if (val == null || val === "") return placeholder(key);
    return String(val);
  });
  return result;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function groupFields(
  fields: TemplateField[],
): { group: string | null; fields: TemplateField[] }[] {
  const groups: Map<string | null, TemplateField[]> = new Map();
  for (const f of fields) {
    const g = f.group ?? null;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(f);
  }
  return Array.from(groups.entries()).map(([group, fields]) => ({
    group,
    fields,
  }));
}

// --- Component ---

export function DocumentFromTemplate({
  organizationId,
  templateId,
  sources,
  onComplete,
  onCancel,
}: DocumentFromTemplateProps) {
  const { data: template } = useQuery(
    convexQuery(api.documentTemplates.getById, { id: templateId }),
  );

  const { data: fields } = useQuery(
    convexQuery(api.documentTemplateFields.listByTemplate, { templateId }),
  );

  const { data: availableSources } = useQuery(
    convexQuery(api.documentDataSources.listAvailableSources, {
      module: template?.module,
    }),
  );

  // Source selection state — user can pick which entities to bind
  const [selectedSources, setSelectedSources] = useState<Record<string, string>>(
    () => ({ ...(sources ?? {}) }),
  );

  // Resolve source values for live preview
  const { data: resolvedSourceData } = useQuery(
    convexQuery(api.documentDataSources.resolveSourceValues, {
      organizationId,
      sources: selectedSources,
    }),
  );

  const createInstance = useMutation(api.documentInstances.create);

  // --- State ---

  const [title, setTitle] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const initializedRef = useRef(false);

  // Initialize title + field defaults when template/fields load
  useEffect(() => {
    if (!template || !fields || initializedRef.current) return;
    initializedRef.current = true;

    setTitle(template.name);

    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.binding) {
        // For bound fields, show auto-fill placeholder for preview
        initial[field.fieldKey] = "";
      } else if (field.defaultValue != null) {
        initial[field.fieldKey] = field.defaultValue;
      } else if (field.type === "checkbox") {
        initial[field.fieldKey] = false;
      } else {
        initial[field.fieldKey] = "";
      }
    }
    setFieldValues(initial);
  }, [template, fields]);

  // Build display values: merge field values with resolved source data for preview
  const displayValues = useMemo(() => {
    if (!fields) return fieldValues;
    const result = { ...fieldValues };
    for (const field of fields) {
      if (
        field.binding &&
        (result[field.fieldKey] === "" ||
          result[field.fieldKey] == null)
      ) {
        // Try to use resolved data from source
        const sourceData = resolvedSourceData?.[field.binding.source];
        const resolvedVal = sourceData?.[field.binding.field];
        if (resolvedVal) {
          result[field.fieldKey] = resolvedVal;
        } else {
          result[field.fieldKey] =
            `[${field.binding.source}.${field.binding.field}]`;
        }
      }
    }
    return result;
  }, [fieldValues, fields, resolvedSourceData]);

  const debouncedValues = useDebounce(displayValues, 300);

  const previewHtml = useMemo(() => {
    if (!template?.content) return "";
    return renderPreview(template.content, debouncedValues);
  }, [template?.content, debouncedValues]);

  // --- Handlers ---

  const updateField = useCallback(
    (key: string, value: unknown) => {
      setFieldValues((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
    },
    [],
  );

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setShowCancelConfirm(true);
    } else {
      onCancel?.();
    }
  }, [isDirty, onCancel]);

  const handleSaveDraft = useCallback(async () => {
    if (!template) return;
    setSubmitting(true);
    try {
      // Build overrides: only fields that were manually set (non-bound or overridden bound fields)
      const fieldOverrides: Record<string, unknown> = {};
      if (fields) {
        for (const field of fields) {
          const val = fieldValues[field.fieldKey];
          // Include if it's a manual field with a value, or a bound field that was overridden
          if (field.binding) {
            if (val !== "" && val != null) {
              fieldOverrides[field.fieldKey] = val;
            }
          } else {
            if (val !== "" && val != null) {
              fieldOverrides[field.fieldKey] = val;
            }
          }
        }
      }

      const instanceId = await createInstance({
        organizationId,
        templateId,
        title,
        sources: selectedSources,
        fieldOverrides,
      });

      toast.success("Dokument zapisany jako szkic");
      onComplete?.(instanceId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Wystapil blad";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [
    template,
    fields,
    fieldValues,
    createInstance,
    organizationId,
    templateId,
    title,
    sources,
    onComplete,
  ]);

  // --- Loading state ---

  if (!template || !fields) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Ladowanie szablonu...
      </div>
    );
  }

  const fieldGroups = groupFields(fields);

  // --- Field renderer ---

  function renderField(field: TemplateField) {
    const value = fieldValues[field.fieldKey];
    const isBound = !!field.binding;
    const isRequired = field.validation?.required;

    const label = (
      <div className="flex items-center gap-2">
        <Label htmlFor={field.fieldKey}>
          {field.label}
          {isRequired && <span className="text-destructive ml-0.5">*</span>}
        </Label>
        {isBound && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Auto
          </Badge>
        )}
      </div>
    );

    const helpText = field.helpText ? (
      <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
    ) : null;

    const placeholder =
      field.placeholder ??
      (isBound
        ? `[auto: ${field.binding!.source}.${field.binding!.field}]`
        : undefined);

    const commonProps = {
      id: field.fieldKey,
      placeholder,
    };

    let input: React.ReactNode;

    switch (field.type) {
      case "text":
      case "phone":
      case "pesel":
        input = (
          <Input
            {...commonProps}
            type={field.type === "phone" ? "tel" : "text"}
            value={String(value ?? "")}
            onChange={(e) => updateField(field.fieldKey, e.target.value)}
          />
        );
        break;

      case "email":
        input = (
          <Input
            {...commonProps}
            type="email"
            value={String(value ?? "")}
            onChange={(e) => updateField(field.fieldKey, e.target.value)}
          />
        );
        break;

      case "textarea":
        input = (
          <Textarea
            {...commonProps}
            value={String(value ?? "")}
            onChange={(e) => updateField(field.fieldKey, e.target.value)}
            className="min-h-[80px]"
          />
        );
        break;

      case "number":
      case "currency":
        input = (
          <Input
            {...commonProps}
            type="number"
            step={field.type === "currency" ? "0.01" : undefined}
            value={String(value ?? "")}
            onChange={(e) => updateField(field.fieldKey, e.target.value)}
          />
        );
        break;

      case "date":
        input = (
          <Input
            {...commonProps}
            type="date"
            value={String(value ?? "")}
            onChange={(e) => updateField(field.fieldKey, e.target.value)}
          />
        );
        break;

      case "select":
        input = (
          <Select
            value={String(value ?? "")}
            onValueChange={(v) => updateField(field.fieldKey, v)}
          >
            <SelectTrigger id={field.fieldKey} className="h-9">
              <SelectValue placeholder={placeholder ?? "Wybierz..."} />
            </SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;

      case "checkbox":
        input = (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id={field.fieldKey}
              checked={!!value}
              onCheckedChange={(checked) =>
                updateField(field.fieldKey, !!checked)
              }
            />
            <Label
              htmlFor={field.fieldKey}
              className="text-sm font-normal cursor-pointer"
            >
              {field.label}
            </Label>
          </div>
        );
        // For checkbox, skip the outer label
        return (
          <div
            key={field._id}
            className={cn(
              field.width === "half" ? "col-span-1" : "col-span-2",
            )}
          >
            {isBound && (
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Auto
                </Badge>
              </div>
            )}
            {input}
            {helpText}
          </div>
        );

      case "signature":
        // Signatures are handled at a different stage, skip here
        return null;

      default:
        input = (
          <Input
            {...commonProps}
            value={String(value ?? "")}
            onChange={(e) => updateField(field.fieldKey, e.target.value)}
          />
        );
    }

    return (
      <div
        key={field._id}
        className={cn(
          "space-y-1.5",
          field.width === "half" ? "col-span-1" : "col-span-2",
        )}
      >
        {label}
        {input}
        {helpText}
      </div>
    );
  }

  // --- Panels ---

  const formPanel = (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        {/* Title */}
        <div className="space-y-1.5">
          <Label htmlFor="doc-title">
            Tytul dokumentu
            <span className="text-destructive ml-0.5">*</span>
          </Label>
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setIsDirty(true);
            }}
          />
        </div>

        {/* Source selection — for templates that require entity data */}
        {template.requiredSources.length > 0 && availableSources && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground border-b pb-1">
              Źródła danych
            </h3>
            {template.requiredSources
              .map((key) => availableSources.find((s) => s.key === key))
              .filter(Boolean)
              .map((source) => (
                <SourceInstancePicker
                  key={source!.key}
                  sourceKey={source!.key}
                  sourceLabel={source!.label}
                  organizationId={organizationId}
                  selectedId={selectedSources[source!.key]}
                  onSelect={(id) => {
                    setSelectedSources((prev) => ({ ...prev, [source!.key]: id }));
                    setIsDirty(true);
                  }}
                />
              ))}
          </div>
        )}

        {/* Field groups */}
        {fieldGroups.map(({ group, fields: groupFields }) => (
          <div key={group ?? "__ungrouped"}>
            {group && (
              <h3 className="text-sm font-medium text-muted-foreground mb-3 border-b pb-1">
                {group}
              </h3>
            )}
            <div className="grid grid-cols-2 gap-3">
              {groupFields.map(renderField)}
            </div>
          </div>
        ))}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-4 border-t">
          <Button
            onClick={handleSaveDraft}
            disabled={submitting || !title.trim()}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Zapisz jako szkic
          </Button>
          <Button variant="outline" onClick={handleCancel} disabled={submitting}>
            Anuluj
          </Button>
        </div>
      </div>
    </ScrollArea>
  );

  const previewPanel = (
    <ScrollArea className="h-full">
      <div className="p-6 flex justify-center">
        <div
          className="bg-white text-black rounded shadow-sm border w-full max-w-[210mm] min-h-[297mm] p-[20mm]"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Desktop: split view */}
      <div className="hidden md:flex h-full min-h-0">
        <div className="w-[40%] border-r flex flex-col min-h-0">
          <div className="p-4 border-b flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Pola dokumentu</h2>
          </div>
          <div className="flex-1 min-h-0">{formPanel}</div>
        </div>
        <div className="w-[60%] flex flex-col min-h-0 bg-muted/30">
          <div className="p-4 border-b flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Podglad</h2>
          </div>
          <div className="flex-1 min-h-0">{previewPanel}</div>
        </div>
      </div>

      {/* Mobile: tabs */}
      <div className="md:hidden flex flex-col h-full min-h-0">
        <Tabs defaultValue="form" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="form">Pola</TabsTrigger>
            <TabsTrigger value="preview">Podglad</TabsTrigger>
          </TabsList>
          <TabsContent value="form" className="flex-1 min-h-0">
            {formPanel}
          </TabsContent>
          <TabsContent value="preview" className="flex-1 min-h-0">
            {previewPanel}
          </TabsContent>
        </Tabs>
      </div>

      {/* Cancel confirmation dialog */}
      <AlertDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odrzucic zmiany?</AlertDialogTitle>
            <AlertDialogDescription>
              Masz niezapisane zmiany. Czy na pewno chcesz anulowac?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Wrocic</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCancelConfirm(false);
                onCancel?.();
              }}
            >
              Odrzuc
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export type { DocumentFromTemplateProps };
