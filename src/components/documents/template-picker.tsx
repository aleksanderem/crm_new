import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id, Doc } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, FileText } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

// --- Types ---

type TemplateDoc = Doc<"documentTemplates">;
type TemplateData = TemplateDoc & { fieldCount: number };

const CATEGORY_LABELS: Record<string, string> = {
  contract: "Umowa",
  invoice: "Faktura",
  consent: "Zgoda",
  referral: "Skierowanie",
  prescription: "Recepta",
  report: "Raport",
  protocol: "Protokol",
  custom: "Inne",
};

const SOURCE_LABELS: Record<string, string> = {
  patient: "Pacjent",
  contact: "Kontakt",
  company: "Firma",
  lead: "Szansa",
  employee: "Pracownik",
  appointment: "Wizyta",
  organization: "Organizacja",
  author: "Autor",
};

function getSourceLabel(sourceKey: string): string {
  return SOURCE_LABELS[sourceKey] ?? sourceKey;
}

// --- Props ---

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  module?: string;
  availableSources?: Record<string, string>;
  onSelect: (templateId: Id<"documentTemplates">, template: TemplateData) => void;
}

// --- Component ---

export function TemplatePicker({
  open,
  onOpenChange,
  organizationId,
  module,
  availableSources,
  onSelect,
}: TemplatePickerProps) {
  const [search, setSearch] = useState("");

  const { data: templates } = useQuery(
    convexQuery(api.documentTemplates.listActive, { organizationId, module })
  );

  const filtered = useMemo(() => {
    if (!templates) return [];
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  const grouped = useMemo(() => {
    const groups: Record<string, TemplateData[]> = {};
    for (const t of filtered) {
      const cat = t.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    }
    // Sort categories alphabetically by label
    const sorted = Object.entries(groups).sort(([a], [b]) =>
      (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b)
    );
    return sorted;
  }, [filtered]);

  function isSatisfied(template: TemplateData): boolean {
    if (!template.requiredSources.length) return true;
    if (!availableSources) return false;
    return template.requiredSources.every((s) => s in availableSources);
  }

  function getMissingSources(template: TemplateData): string[] {
    if (!template.requiredSources.length) return [];
    const available = availableSources ?? {};
    return template.requiredSources.filter((s) => !(s in available));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Wybierz szablon dokumentu</DialogTitle>
          <DialogDescription>
            Wybierz szablon, na podstawie ktorego zostanie utworzony dokument.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj szablonu..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[55vh]">
          {!templates && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Ladowanie szablonow...
            </div>
          )}

          {templates && grouped.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
              <FileText className="h-8 w-8" />
              <span>Brak szablonow</span>
            </div>
          )}

          <div className="space-y-6 pr-4">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">
                  {CATEGORY_LABELS[category] ?? category}
                </h3>
                <div className="space-y-2">
                  {items.map((template) => {
                    const satisfied = isSatisfied(template);
                    const missing = getMissingSources(template);

                    return (
                      <button
                        key={template._id}
                        type="button"
                        disabled={!satisfied}
                        onClick={() => onSelect(template._id, template)}
                        className={cn(
                          "w-full text-left rounded-lg border p-3 transition-colors",
                          satisfied
                            ? "hover:bg-accent hover:border-accent-foreground/20 cursor-pointer"
                            : "opacity-50 cursor-not-allowed"
                        )}
                        title={
                          !satisfied
                            ? `Wymaga kontekstu: ${missing.map(getSourceLabel).join(", ")}`
                            : undefined
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium truncate">
                                {template.name}
                              </span>
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {CATEGORY_LABELS[template.category] ?? template.category}
                              </Badge>
                            </div>
                            {template.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {template.description}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {template.fieldCount}{" "}
                              {template.fieldCount === 1 ? "pole" : "pol"}
                            </span>
                          </div>
                        </div>

                        {template.requiredSources.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {template.requiredSources.map((source) => {
                              const isAvailable = availableSources
                                ? source in availableSources
                                : false;
                              return (
                                <Badge
                                  key={source}
                                  variant={isAvailable ? "default" : "outline"}
                                  className="text-xs"
                                >
                                  {getSourceLabel(source)}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export type { TemplatePickerProps, TemplateData };
