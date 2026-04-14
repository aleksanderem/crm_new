import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2, Search, User, Calendar, Building2, TrendingUp, Users, Stethoscope, Briefcase } from "@/lib/ez-icons";
import {
  extractFormFields,
  extractVariablePaths,
  renderDocument,
  type ExtractedFormField,
} from "@/components/documents/document-renderer";
import { flattenScopeData, VARIABLE_REGISTRY } from "@/lib/document-variables";
import type { VariableField } from "@/lib/document-variables";
import type { EntityType } from "@/components/documents/template-settings-sheet";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TemplatePreviewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  contentJson: string;
  entityTypes: EntityType[];
}

// ---------------------------------------------------------------------------
// Entity type config
// ---------------------------------------------------------------------------

interface EntityTypeConfig {
  labelPl: string;
  labelEn: string;
  icon: React.ElementType;
  displayFn: (item: Record<string, unknown>) => string;
  subtitleFn?: (item: Record<string, unknown>) => string;
}

const ENTITY_CONFIG: Record<string, EntityTypeConfig> = {
  patient: {
    labelPl: "Pacjent",
    labelEn: "Patient",
    icon: User,
    displayFn: (p) => `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Bez nazwy",
    subtitleFn: (p) => (p.email as string) || (p.phone as string) || "",
  },
  contact: {
    labelPl: "Kontakt",
    labelEn: "Contact",
    icon: Users,
    displayFn: (c) => `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || (c.email as string) || "Bez nazwy",
    subtitleFn: (c) => (c.email as string) || (c.company as string) || "",
  },
  appointment: {
    labelPl: "Wizyta",
    labelEn: "Appointment",
    icon: Calendar,
    displayFn: (a) => {
      const date = a.date ? new Date(a.date as number).toLocaleDateString("pl") : "";
      return `${date} ${a.startTime ?? ""}`.trim() || "Wizyta";
    },
    subtitleFn: (a) => (a.treatmentName as string) || (a.status as string) || "",
  },
  company: {
    labelPl: "Firma",
    labelEn: "Company",
    icon: Building2,
    displayFn: (c) => (c.name as string) || "Bez nazwy",
    subtitleFn: (c) => (c.domain as string) || (c.industry as string) || "",
  },
  lead: {
    labelPl: "Transakcja",
    labelEn: "Deal",
    icon: TrendingUp,
    displayFn: (l) => (l.title as string) || "Bez nazwy",
    subtitleFn: (l) => {
      const v = l.value as number | undefined;
      return v ? `${v.toLocaleString("pl")} PLN` : (l.status as string) || "";
    },
  },
  employee: {
    labelPl: "Pracownik",
    labelEn: "Employee",
    icon: Briefcase,
    displayFn: (e) => (e.name as string) || `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || "Bez nazwy",
    subtitleFn: (e) => (e.role as string) || (e.specialization as string) || "",
  },
  treatment: {
    labelPl: "Zabieg",
    labelEn: "Treatment",
    icon: Stethoscope,
    displayFn: (t) => (t.name as string) || "Bez nazwy",
    subtitleFn: (t) => {
      const p = t.price as number | undefined;
      return p ? `${p.toLocaleString("pl")} PLN` : (t.duration as string) || "";
    },
  },
};

// ---------------------------------------------------------------------------
// Variable label map (for friendly names)
// ---------------------------------------------------------------------------

function buildVariableLabelMap(): Map<string, VariableField> {
  const map = new Map<string, VariableField>();
  for (const fields of Object.values(VARIABLE_REGISTRY)) {
    for (const f of fields) {
      map.set(f.path, f);
    }
  }
  return map;
}

const VAR_LABEL_MAP = buildVariableLabelMap();

// ---------------------------------------------------------------------------
// Missing variable item
// ---------------------------------------------------------------------------

function MissingVariableItem({
  path,
  lang,
}: {
  path: string;
  lang: "pl" | "en";
}) {
  const varInfo = VAR_LABEL_MAP.get(path);
  const label = varInfo
    ? lang === "en"
      ? varInfo.labelEn
      : varInfo.label
    : path;
  const dotIdx = path.indexOf(".");
  const prefix = dotIdx > -1 ? path.substring(0, dotIdx) : "";

  return (
    <div className="rounded-md border border-dashed border-orange-300 bg-orange-50 p-3 space-y-1 dark:border-orange-700 dark:bg-orange-950/30">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{path}</span>
        {prefix && (
          <span className="ml-2 text-orange-600 dark:text-orange-400">
            {lang === "pl" ? "Brak danych" : "No data"}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form field preview (read-only)
// ---------------------------------------------------------------------------

function FormFieldPreview({ field }: { field: ExtractedFormField }) {
  const typeLabels: Record<string, string> = {
    text: "Tekst",
    textarea: "Tekst wieloliniowy",
    select: "Lista wyboru",
    date: "Data",
    checkbox: "Pole wyboru",
  };

  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {field.label || field.fieldId}
        </span>
        {field.required && (
          <span className="text-[10px] text-red-500 font-medium">*</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">
          {typeLabels[field.fieldType] ?? field.fieldType}
        </span>
        {field.placeholder && <span>{field.placeholder}</span>}
      </div>
      {field.fieldType === "select" && field.options && (
        <div className="text-xs text-muted-foreground">
          {field.options}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entity picker item
// ---------------------------------------------------------------------------

function EntityItem({
  item,
  config,
  selected,
  onClick,
}: {
  item: Record<string, unknown>;
  config: EntityTypeConfig;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = config.icon;
  const title = config.displayFn(item);
  const subtitle = config.subtitleFn?.(item);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        selected
          ? "bg-primary/10 text-primary border border-primary/30"
          : "hover:bg-muted/50 border border-transparent"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{title}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplatePreviewSheet({
  open,
  onOpenChange,
  organizationId,
  contentJson,
  entityTypes,
}: TemplatePreviewSheetProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === "pl" ? "pl" : "en";

  const [entityType, setEntityType] = useState<EntityType | "">("");
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Reset selection when entity type changes
  useEffect(() => {
    setSelectedEntityId("");
    setSearchQuery("");
  }, [entityType]);

  // Available entity types (from template config or all)
  const availableTypes = entityTypes.length > 0
    ? entityTypes
    : (Object.keys(ENTITY_CONFIG) as EntityType[]);

  // Auto-select first type if only one available
  useEffect(() => {
    if (open && availableTypes.length === 1 && !entityType) {
      setEntityType(availableTypes[0]);
    }
  }, [open, availableTypes, entityType]);

  // --- Entity list queries (one per type, only the active one fires) ---

  const { data: patients } = useQuery({
    ...convexQuery(api.gabinet.patients.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: entityType === "patient",
  });

  const { data: contacts } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: entityType === "contact",
  });

  const { data: appointments } = useQuery({
    ...convexQuery(api.gabinet.appointments.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: entityType === "appointment",
  });

  const { data: companies } = useQuery({
    ...convexQuery(api.companies.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: entityType === "company",
  });

  const { data: leads } = useQuery({
    ...convexQuery(api.leads.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: entityType === "lead",
  });

  const { data: employees } = useQuery({
    ...convexQuery(api.gabinet.employees.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: entityType === "employee",
  });

  const { data: treatments } = useQuery({
    ...convexQuery(api.gabinet.treatments.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: entityType === "treatment",
  });

  // Normalize entity lists to a common shape
  const entityList = useMemo((): Array<Record<string, unknown>> => {
    if (!entityType) return [];
    // All queries use pagination, so extract .page
    const raw = { patient: patients, contact: contacts, appointment: appointments, company: companies, lead: leads, employee: employees, treatment: treatments }[entityType];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: unknown[] = (raw as any)?.page ?? [];
    return (items as Record<string, unknown>[]).filter((item) => {
      if (!searchQuery.trim()) return true;
      const config = ENTITY_CONFIG[entityType];
      if (!config) return true;
      const text = `${config.displayFn(item)} ${config.subtitleFn?.(item) ?? ""}`.toLowerCase();
      return text.includes(searchQuery.toLowerCase());
    });
  }, [entityType, patients, contacts, appointments, companies, leads, employees, treatments, searchQuery]);

  // --- Scope resolution (fires when entity selected) ---

  const { data: scopeData, isLoading: scopeLoading } = useQuery({
    ...convexQuery(api.documents.generate.resolveEntityScope, {
      organizationId,
      entityType: entityType || "patient",
      entityId: selectedEntityId,
    }),
    enabled: !!entityType && !!selectedEntityId,
  });

  const flatScope = useMemo(() => {
    if (!scopeData) return null;
    return flattenScopeData(scopeData as Record<string, Record<string, unknown>>);
  }, [scopeData]);

  // Detect missing variables
  const missingVars = useMemo(() => {
    if (!contentJson || !flatScope) return [];
    try {
      const json = JSON.parse(contentJson);
      const paths = extractVariablePaths(json);
      return paths.filter((path) => {
        if (path.startsWith("system.") || path.startsWith("organization.")) return false;
        const value = flatScope[path];
        return !value || value.trim() === "";
      });
    } catch {
      return [];
    }
  }, [contentJson, flatScope]);

  const renderedHtml = useMemo(() => {
    if (!flatScope || !contentJson) return null;
    try {
      return renderDocument(contentJson, flatScope, undefined, {
        highlightMissing: true,
      });
    } catch {
      return null;
    }
  }, [contentJson, flatScope]);

  const { employeeFields, clientFields } = useMemo(() => {
    if (!contentJson) return { employeeFields: [], clientFields: [] };
    try {
      const json = JSON.parse(contentJson);
      const allFields = extractFormFields(json);
      return {
        employeeFields: allFields.filter((f) => (f.filledBy || "employee") === "employee"),
        clientFields: allFields.filter((f) => f.filledBy === "client"),
      };
    } catch {
      return { employeeFields: [], clientFields: [] };
    }
  }, [contentJson]);

  // Group missing vars by entity prefix for display
  const groupedMissingVars = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const path of missingVars) {
      const dotIdx = path.indexOf(".");
      const prefix = dotIdx > -1 ? path.substring(0, dotIdx) : "other";
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(path);
    }
    return groups;
  }, [missingVars]);

  const hasPreview = !!selectedEntityId && !!flatScope;
  const config = entityType ? ENTITY_CONFIG[entityType] : null;
  const totalClientItems = clientFields.length + missingVars.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="border-b px-6 py-4 shrink-0">
          <SheetTitle className="text-base">
            {t("formEditor.previewTitle", "Podgląd szablonu")}
          </SheetTitle>
          <SheetDescription className="text-sm">
            {t("formEditor.previewDescription", "Wybierz rekord, aby zobaczyć podgląd dokumentu z wypełnionymi danymi")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1">
          {/* Left: entity picker */}
          <div className="flex w-64 shrink-0 flex-col border-r">
            {/* Type selector */}
            <div className="border-b p-3">
              <Select
                value={entityType}
                onValueChange={(v) => setEntityType(v as EntityType)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("formEditor.previewPickSource", "Źródło danych...")} />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((et) => {
                    const cfg = ENTITY_CONFIG[et];
                    if (!cfg) return null;
                    const Icon = cfg.icon;
                    return (
                      <SelectItem key={et} value={et}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5" />
                          <span>{lang === "pl" ? cfg.labelPl : cfg.labelEn}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            {entityType && (
              <div className="border-b p-3">
                <div className="flex items-center gap-2 rounded-md border px-2">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    className="h-8 border-0 shadow-none focus-visible:ring-0 px-0 text-sm"
                    placeholder={t("common.search", "Szukaj...")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Entity list */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {entityType && config && entityList.map((item) => {
                  const id = (item._id as string) || "";
                  return (
                    <EntityItem
                      key={id}
                      item={item}
                      config={config}
                      selected={selectedEntityId === id}
                      onClick={() => setSelectedEntityId(id)}
                    />
                  );
                })}
                {entityType && entityList.length === 0 && (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {t("common.noResults", "Brak wyników")}
                  </p>
                )}
                {!entityType && (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {t("formEditor.previewPickSource", "Wybierz źródło danych")}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: preview */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!selectedEntityId && (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                {t("formEditor.previewSelectRecord", "Wybierz rekord z listy po lewej")}
              </div>
            )}

            {selectedEntityId && scopeLoading && (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.loading", "Ładowanie...")}
              </div>
            )}

            {hasPreview && (
              <Tabs defaultValue="document" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mx-4 mt-3 shrink-0">
                  <TabsTrigger value="document" className="flex-1 text-xs">
                    {t("formEditor.previewTabs.document", "Dokument")}
                    {missingVars.length > 0 && (
                      <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-100 px-1 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                        {missingVars.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="employee" className="flex-1 text-xs">
                    {t("formEditor.previewTabs.employeeForm", "Pracownik")}
                    {employeeFields.length > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ({employeeFields.length})
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="client" className="flex-1 text-xs">
                    {t("formEditor.previewTabs.clientForm", "Klient")}
                    {totalClientItems > 0 && (
                      <span className={`ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium ${
                        missingVars.length > 0
                          ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {totalClientItems}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="document" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  {missingVars.length > 0 && (
                    <div className="mb-3 flex items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {lang === "pl"
                        ? `${missingVars.length} ${missingVars.length === 1 ? "zmienna wymaga" : "zmiennych wymaga"} uzupełnienia danych`
                        : `${missingVars.length} variable${missingVars.length === 1 ? " requires" : "s require"} data completion`}
                    </div>
                  )}
                  {renderedHtml ? (
                    <div
                      className="prose prose-sm max-w-none rounded-lg border bg-white p-6 text-gray-900 [&_*]:!text-gray-900 [&_a]:!text-blue-700 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:p-2"
                      dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      {t("common.noData", "Brak danych")}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="employee" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  {employeeFields.length > 0 ? (
                    <div className="space-y-2">
                      {employeeFields.map((field) => (
                        <FormFieldPreview key={field.fieldId} field={field} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      {t("formEditor.previewNoFields", "Brak pól formularza dla tego widoku")}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="client" className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                  {totalClientItems > 0 ? (
                    <div className="space-y-4">
                      {/* Missing entity data that client needs to provide */}
                      {missingVars.length > 0 && (
                        <div className="space-y-2">
                          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {lang === "pl" ? "Brakujące dane" : "Missing data"}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {lang === "pl"
                              ? "Poniższe dane nie są uzupełnione w profilu. Klient będzie musiał je podać przy wypełnianiu dokumentu."
                              : "The following data is missing from the profile. The client will need to provide it when filling the document."}
                          </p>
                          {Object.entries(groupedMissingVars).map(([prefix, paths]) => (
                            <div key={prefix} className="space-y-1.5">
                              <span className="text-xs font-medium text-muted-foreground capitalize">
                                {VAR_LABEL_MAP.get(`${prefix}.firstName`)?.category
                                  ? (lang === "pl"
                                    ? { patient: "Pacjent", contact: "Kontakt", company: "Firma", employee: "Pracownik", lead: "Lead", treatment: "Zabieg", appointment: "Wizyta" }[prefix] ?? prefix
                                    : prefix)
                                  : prefix}
                              </span>
                              {paths.map((path) => (
                                <MissingVariableItem key={path} path={path} lang={lang} />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Explicit form fields marked for client */}
                      {clientFields.length > 0 && (
                        <div className="space-y-2">
                          {missingVars.length > 0 && (
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {lang === "pl" ? "Pola formularza" : "Form fields"}
                            </h3>
                          )}
                          {clientFields.map((field) => (
                            <FormFieldPreview key={field.fieldId} field={field} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      {t("formEditor.previewNoFields", "Brak pól formularza dla tego widoku")}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
