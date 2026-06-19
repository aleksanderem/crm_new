import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Plus, X, Search } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

function extractPlainText(desc: string): string {
  if (!desc.startsWith("[")) return desc;
  try {
    const nodes = JSON.parse(desc) as Array<{ children?: Array<{ text?: string }> }>;
    return nodes
      .flatMap((n) => (n.children ?? []).map((c) => c.text ?? ""))
      .join(" ")
      .trim();
  } catch {
    return desc;
  }
}

export interface RequiredFormTemplateValue {
  templateId: Id<"formTemplates">;
  timing: "before_start" | "after_completion";
}

interface FormTemplate {
  _id: Id<"formTemplates">;
  name: string;
  description?: string;
}

interface TreatmentRequiredDocumentsFieldProps {
  organizationId: Id<"organizations">;
  value: RequiredFormTemplateValue[];
  onChange: (value: RequiredFormTemplateValue[]) => void;
}

export function TreatmentRequiredDocumentsField({
  organizationId,
  value,
  onChange,
}: TreatmentRequiredDocumentsFieldProps) {
  const { t } = useTranslation();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<Id<"formTemplates"> | null>(null);
  const [selectedTiming, setSelectedTiming] = useState<
    "before_start" | "after_completion"
  >("before_start");

  const listTemplatesByEntityType = useAction(api.documents.templates.listByEntityType);
  const { data: allTemplatesRaw, isLoading: templatesLoading } = useQuery({
    queryKey: ["documents.templates.listByEntityType", organizationId, "treatment"],
    queryFn: () =>
      listTemplatesByEntityType({
        organizationId,
        entityType: "treatment",
      }),
    enabled: !!organizationId,
  });
  const allTemplates = allTemplatesRaw as unknown as FormTemplate[] | undefined;

  const templateMap = new Map<Id<"formTemplates">, FormTemplate>(
    (allTemplates ?? []).map((tpl) => [tpl._id, tpl]),
  );

  const assignedIds = new Set(value.map((r) => r.templateId));

  const filteredPickerTemplates = (allTemplates ?? []).filter(
    (tpl) =>
      !assignedIds.has(tpl._id) &&
      tpl.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAdd = () => {
    if (!selectedTemplateId) return;
    onChange([
      ...value,
      { templateId: selectedTemplateId, timing: selectedTiming },
    ]);
    setAddDialogOpen(false);
    setSelectedTemplateId(null);
    setSearch("");
  };

  const handleRemove = (templateId: Id<"formTemplates">) => {
    onChange(value.filter((r) => r.templateId !== templateId));
  };

  const handleTimingChange = (
    templateId: Id<"formTemplates">,
    newTiming: "before_start" | "after_completion",
  ) => {
    onChange(
      value.map((r) =>
        r.templateId === templateId ? { ...r, timing: newTiming } : r,
      ),
    );
  };

  return (
    <>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t(
            "documents.requiredDocs.description",
            "Te dokumenty zostana automatycznie wygenerowane przy tworzeniu wizyty",
          )}
        </p>

        {value.length > 0 && (
          <div className="rounded-lg border divide-y">
            {value.map((req) => {
              const tpl = templateMap.get(req.templateId);
              return (
                <div
                  key={req.templateId}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {tpl?.name ??
                        t("documents.requiredDocs.unknown", "Nieznany szablon")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <TimingBadge
                      timing={req.timing}
                      onTimingChange={(newTiming) =>
                        handleTimingChange(req.templateId, newTiming)
                      }
                      t={t as (key: string, fallback?: string) => string}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRemove(req.templateId)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => setAddDialogOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" variant="stroke" />
          {t(
            "documents.requiredDocs.addFromTemplate",
            "Dodaj dokumenty z szablonu",
          )}
        </Button>
      </div>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                "documents.requiredDocs.addTitle",
                "Dodaj wymagany dokument",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                "documents.requiredDocs.addDescription",
                "Wybierz szablon dokumentu i okresl, kiedy powinien zostac wypelniony.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(
                  "documents.requiredDocs.searchPlaceholder",
                  "Szukaj szablonu...",
                )}
                className="pl-9"
              />
            </div>

            <ScrollArea className="h-[240px]">
              {templatesLoading ? (
                <div className="space-y-2 p-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : filteredPickerTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {t(
                    "documents.requiredDocs.noTemplates",
                    "Brak dostepnych szablonow",
                  )}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredPickerTemplates.map((tpl) => (
                    <button
                      key={tpl._id}
                      type="button"
                      onClick={() => setSelectedTemplateId(tpl._id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left",
                        "transition-colors cursor-pointer",
                        selectedTemplateId === tpl._id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-accent",
                      )}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {tpl.name}
                        </p>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {extractPlainText(tpl.description)}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("documents.requiredDocs.timing", "Wypełnia:")}
              </label>
              <Select
                value={selectedTiming}
                onValueChange={(v) =>
                  setSelectedTiming(v as "before_start" | "after_completion")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before_start">
                    {t(
                      "documents.requiredDocs.beforeStart",
                      "Przed wizytą",
                    )}
                  </SelectItem>
                  <SelectItem value="after_completion">
                    {t(
                      "documents.requiredDocs.afterCompletion",
                      "Po wizycie",
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false);
                setSelectedTemplateId(null);
                setSearch("");
              }}
            >
              {t("common.cancel", "Anuluj")}
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={!selectedTemplateId}
            >
              {t("common.add", "Dodaj")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TimingBadge({
  timing,
  onTimingChange,
  t,
}: {
  timing: "before_start" | "after_completion";
  onTimingChange: (newTiming: "before_start" | "after_completion") => void;
  t: (key: string, fallback?: string) => string;
}) {
  const isBefore = timing === "before_start";

  return (
    <button
      type="button"
      onClick={() =>
        onTimingChange(isBefore ? "after_completion" : "before_start")
      }
      className="cursor-pointer"
      title={t(
        "documents.requiredDocs.toggleTiming",
        "Kliknij, aby zmienic moment",
      )}
    >
      <Badge
        className={cn(
          "text-xs select-none",
          isBefore
            ? "bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
            : "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
        )}
        variant="outline"
      >
        {isBefore
          ? t("documents.requiredDocs.beforeStart", "Przed wizytą")
          : t("documents.requiredDocs.afterCompletion", "Po wizycie")}
      </Badge>
    </button>
  );
}
