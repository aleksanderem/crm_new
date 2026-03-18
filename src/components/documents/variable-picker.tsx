import { useState, useMemo, useCallback } from "react";
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

interface VariablePickerProps {
  entityTypes: string[];
  onAddVariable: (variable: VariableField) => void;
  /** Set of variable paths already present in the template */
  usedPaths: Set<string>;
  /** Optional className for outer container */
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [
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

export function VariablePicker({
  entityTypes,
  onAddVariable,
  usedPaths,
  className,
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

  const sortedCategories = CATEGORY_ORDER.filter((c) => c in grouped);

  if (entityTypes.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center p-4 text-center",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">
          {t(
            "formEditor.variablePicker.noEntityTypes",
            "Wybierz typy encji w ustawieniach szablonu, aby zobaczyć dostępne zmienne.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="border-b px-3 py-2">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("formEditor.variablePicker.title", "Zmienne")}
        </h3>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              "formEditor.variablePicker.search",
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
                "formEditor.variablePicker.noResults",
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
                                    "formEditor.variablePicker.alreadyAdded",
                                    "Już dodano",
                                  )
                                : t(
                                    "formEditor.variablePicker.addToTemplate",
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
            "formEditor.variablePicker.hint",
            "Kliknij + aby dodać zmienną do szablonu PDF. Nazwy pól odpowiadają ścieżkom zmiennych.",
          )}
        </p>
      </div>
    </div>
  );
}
