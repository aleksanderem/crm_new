import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import type { Template } from "@pdfme/common";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronRight } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import {
  getVariablesForEntityTypes,
  groupVariablesByCategory,
  CATEGORY_LABELS,
  type VariableField,
} from "@/lib/pdfme/variables";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfmeDesignerProps {
  initialTemplate?: string; // JSON string of Template
  onChange?: (templateJson: string) => void;
  /** Entity types determine which variables are available in the picker */
  entityTypes?: string[];
}

// ---------------------------------------------------------------------------
// Blank template helper
// ---------------------------------------------------------------------------

function getBlankTemplate(): Template {
  return {
    basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] },
    schemas: [[]],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract field names from a PDFme template */
function extractFieldNames(template: Template): Set<string> {
  const paths = new Set<string>();
  for (const page of template.schemas) {
    for (const schema of page) {
      if (typeof schema === "object" && schema !== null && "name" in schema) {
        paths.add((schema as Record<string, unknown>).name as string);
      }
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Variable Picker Sidebar
// ---------------------------------------------------------------------------

interface VariablePickerProps {
  entityTypes: string[];
  onAddVariable: (variable: VariableField) => void;
  /** Set of variable paths already present in the template */
  usedPaths: Set<string>;
}

function VariablePicker({
  entityTypes,
  onAddVariable,
  usedPaths,
}: VariablePickerProps) {
  const { t, i18n } = useTranslation();
  const isPl = i18n.language?.startsWith("pl");
  const [search, setSearch] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  const variables = useMemo(
    () => getVariablesForEntityTypes(entityTypes),
    [entityTypes],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return variables;
    const q = search.toLowerCase();
    return variables.filter(
      (v) =>
        v.path.toLowerCase().includes(q) ||
        v.label.toLowerCase().includes(q) ||
        v.labelEn.toLowerCase().includes(q),
    );
  }, [variables, search]);

  const grouped = useMemo(
    () => groupVariablesByCategory(filtered),
    [filtered],
  );

  const toggleCategory = useCallback((cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }, []);

  const categoryOrder = [
    "organization",
    "system",
    "patient",
    "contact",
    "company",
    "employee",
    "treatment",
    "appointment",
    "lead",
  ];
  const sortedCategories = categoryOrder.filter((c) => c in grouped);

  if (entityTypes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-center">
        <p className="text-xs text-muted-foreground">
          {t(
            "settings.formTemplates.variablePicker.noEntityTypes",
            "Wybierz typy encji w ustawieniach szablonu, aby zobaczyć dostępne zmienne.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-3 py-2">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("settings.formTemplates.variablePicker.title", "Zmienne")}
        </h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              "settings.formTemplates.variablePicker.search",
              "Szukaj...",
            )}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {sortedCategories.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t(
                "settings.formTemplates.variablePicker.noResults",
                "Brak wyników",
              )}
            </p>
          )}

          {sortedCategories.map((cat) => {
            const isCollapsed = collapsedCategories.has(cat);
            const catLabel = isPl
              ? (CATEGORY_LABELS[cat]?.pl ?? cat)
              : (CATEGORY_LABELS[cat]?.en ?? cat);

            return (
              <div key={cat} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0 transition-transform",
                      !isCollapsed && "rotate-90",
                    )}
                  />
                  <span className="truncate">{catLabel}</span>
                  <span className="ml-auto text-[10px] tabular-nums text-muted-foreground/60">
                    {grouped[cat].length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="ml-1 mt-0.5 space-y-0.5">
                    {grouped[cat].map((variable) => {
                      const isUsed = usedPaths.has(variable.path);
                      return (
                        <div
                          key={variable.path}
                          className={cn(
                            "group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs",
                            isUsed
                              ? "bg-muted/50 text-muted-foreground"
                              : "hover:bg-accent",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">
                              {isPl ? variable.label : variable.labelEn}
                            </div>
                            <div className="truncate text-[10px] text-muted-foreground">
                              {variable.path}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-5 w-5 shrink-0",
                              isUsed
                                ? "cursor-default opacity-30"
                                : "opacity-0 group-hover:opacity-100",
                            )}
                            onClick={() => {
                              if (!isUsed) onAddVariable(variable);
                            }}
                            disabled={isUsed}
                            title={
                              isUsed
                                ? t(
                                    "settings.formTemplates.variablePicker.alreadyAdded",
                                    "Już dodano",
                                  )
                                : t(
                                    "settings.formTemplates.variablePicker.addToTemplate",
                                    "Dodaj do szablonu",
                                  )
                            }
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div className="border-t px-3 py-2">
        <p className="text-[10px] text-muted-foreground">
          {t(
            "settings.formTemplates.variablePicker.hint",
            "Kliknij + aby dodać zmienną do szablonu PDF. Nazwy pól odpowiadają ścieżkom zmiennych.",
          )}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component — wraps PDFme Designer (vanilla JS) with a variable picker
// ---------------------------------------------------------------------------

export function PdfmeDesigner({
  initialTemplate,
  onChange,
  entityTypes = [],
}: PdfmeDesignerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track which variable paths are currently in the template
  const [usedPaths, setUsedPaths] = useState<Set<string>>(() => {
    if (!initialTemplate) return new Set();
    try {
      return extractFieldNames(JSON.parse(initialTemplate) as Template);
    } catch {
      return new Set();
    }
  });

  const updateUsedPaths = useCallback((template: Template) => {
    setUsedPaths(extractFieldNames(template));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    const initDesigner = async () => {
      const { Designer } = await import("@pdfme/ui");
      const { text, image, barcodes } = await import("@pdfme/schemas");

      if (destroyed) return;

      let template: Template;
      if (initialTemplate) {
        try {
          template = JSON.parse(initialTemplate);
        } catch {
          template = getBlankTemplate();
        }
      } else {
        template = getBlankTemplate();
      }

      const plugins = {
        Text: text,
        Image: image,
        QRCode: barcodes.qrcode,
      };

      const designer = new Designer({
        domContainer: containerRef.current!,
        template,
        plugins,
      });

      designer.onChangeTemplate((tpl: Template) => {
        updateUsedPaths(tpl);
        if (onChangeRef.current) {
          onChangeRef.current(JSON.stringify(tpl));
        }
      });

      designerRef.current = designer;
    };

    initDesigner();

    return () => {
      destroyed = true;
      designerRef.current?.destroy();
    };
  }, []); // mount once

  // Handler: add a variable field to the PDFme template
  const handleAddVariable = useCallback(
    (variable: VariableField) => {
      const designer = designerRef.current;
      if (!designer) return;

      const template = designer.getTemplate() as Template;
      const pageSchemas = [...(template.schemas[0] ?? [])];

      // Auto-position: find the lowest Y in existing schemas, place below
      let nextY = 10;
      for (const schema of pageSchemas) {
        const s = schema as Record<string, unknown>;
        const pos = s.position as { x: number; y: number } | undefined;
        const h = (s.height as number) ?? 10;
        if (pos) {
          const bottom = pos.y + h;
          if (bottom + 5 > nextY) {
            nextY = bottom + 5;
          }
        }
      }

      // Clamp to page bounds (A4 = 297mm height, with padding)
      if (nextY > 270) nextY = 10;

      const newSchema = {
        name: variable.path,
        type: "text" as const,
        position: { x: 10, y: nextY },
        width: 80,
        height: 10,
        fontSize: 10,
      };

      pageSchemas.push(newSchema);

      const updatedTemplate: Template = {
        ...template,
        schemas: [pageSchemas, ...template.schemas.slice(1)],
      };

      designer.updateTemplate(updatedTemplate);
      updateUsedPaths(updatedTemplate);

      if (onChangeRef.current) {
        onChangeRef.current(JSON.stringify(updatedTemplate));
      }
    },
    [updateUsedPaths],
  );

  const showPicker = entityTypes.length > 0;

  return (
    <div className="flex h-full">
      {/* Variable picker sidebar */}
      {showPicker && (
        <div className="w-56 shrink-0 border-r bg-background">
          <VariablePicker
            entityTypes={entityTypes}
            onAddVariable={handleAddVariable}
            usedPaths={usedPaths}
          />
        </div>
      )}

      {/* PDFme Designer */}
      <div
        ref={containerRef}
        className={cn(
          "min-w-0 flex-1",
          showPicker ? "h-full" : "h-[calc(100vh-200px)] w-full",
        )}
      />
    </div>
  );
}

// Re-export under old name for lazy() compatibility in consumer routes
export { PdfmeDesigner as SurveyCreatorEditor };
