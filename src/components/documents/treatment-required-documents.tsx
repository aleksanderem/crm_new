import { useState, useCallback } from "react";
import type { TFunction } from "i18next";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileText, Plus, X, Search } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RequiredFormTemplateTiming =
  | "before_start"
  | "during_visit"
  | "after_completion";

type DocumentFrequency =
  | "once"
  | "first_visit_only"
  | "before_each_visit"
  | "every_n_days"
  | "on_expiry";

interface RequiredFormTemplate {
  templateId: Id<"formTemplates">;
  timing: RequiredFormTemplateTiming;
  isRequired?: boolean;
  frequency?: DocumentFrequency;
  validityDays?: number;
  /** @deprecated use frequency="once" for new entries */
  isOneTime?: boolean;
}

interface TreatmentRequiredDocumentsProps {
  treatmentId: Id<"gabinetTreatments">;
  organizationId: Id<"organizations">;
  requiredFormTemplates: RequiredFormTemplate[];
  readOnly?: boolean;
}

interface FormTemplate {
  _id: Id<"formTemplates">;
  name: string;
  description?: string;
}

const VALIDITY_REQUIRED_FREQUENCIES: DocumentFrequency[] = ["every_n_days", "on_expiry"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TreatmentRequiredDocuments({
  treatmentId,
  organizationId,
  requiredFormTemplates,
  readOnly = false,
}: TreatmentRequiredDocumentsProps) {
  const { t } = useTranslation();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<Id<"formTemplates"> | null>(null);
  const [selectedTiming, setSelectedTiming] =
    useState<RequiredFormTemplateTiming>("before_start");
  const [selectedFrequency, setSelectedFrequency] =
    useState<DocumentFrequency>("before_each_visit");
  const [selectedValidityDays, setSelectedValidityDays] = useState<string>("365");
  const [selectedIsRequired, setSelectedIsRequired] = useState(true);

  const updateTreatment = useAction(api.gabinet.treatments.update);

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

  const assignedIds = new Set(
    requiredFormTemplates.map((r) => r.templateId),
  );

  const filteredPickerTemplates = (allTemplates ?? []).filter(
    (tpl) =>
      !assignedIds.has(tpl._id) &&
      tpl.name.toLowerCase().includes(search.toLowerCase()),
  );

  const needsValidity = VALIDITY_REQUIRED_FREQUENCIES.includes(selectedFrequency);

  const resetDialog = () => {
    setSelectedTemplateId(null);
    setSearch("");
    setSelectedFrequency("before_each_visit");
    setSelectedValidityDays("365");
    setSelectedIsRequired(true);
  };

  // --- Handlers ---

  const handleAdd = useCallback(async () => {
    if (!selectedTemplateId) return;

    const validityDays = needsValidity ? parseInt(selectedValidityDays, 10) || 365 : undefined;
    const updated: RequiredFormTemplate[] = [
      ...requiredFormTemplates,
      {
        templateId: selectedTemplateId,
        timing: selectedTiming,
        isRequired: selectedIsRequired,
        frequency: selectedFrequency,
        validityDays,
      },
    ];

    try {
      await updateTreatment({
        organizationId,
        treatmentId,
        requiredFormTemplates: updated,
      });
      toast.success(
        t("documents.requiredDocs.added", "Dodano wymagany dokument"),
      );
      setAddDialogOpen(false);
      resetDialog();
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("common.error");
      toast.error(msg);
    }
  }, [
    selectedTemplateId,
    selectedTiming,
    selectedFrequency,
    selectedValidityDays,
    selectedIsRequired,
    needsValidity,
    requiredFormTemplates,
    updateTreatment,
    organizationId,
    treatmentId,
    t,
  ]);

  const handleRemove = useCallback(
    async (templateId: Id<"formTemplates">) => {
      const updated = requiredFormTemplates.filter(
        (r) => r.templateId !== templateId,
      );

      try {
        await updateTreatment({
          organizationId,
          treatmentId,
          requiredFormTemplates: updated,
        });
        toast.success(
          t("documents.requiredDocs.removed", "Usunieto wymagany dokument"),
        );
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : t("common.error");
        toast.error(msg);
      }
    },
    [requiredFormTemplates, updateTreatment, organizationId, treatmentId, t],
  );

  const handleFrequencyChange = useCallback(
    async (templateId: Id<"formTemplates">, newFrequency: DocumentFrequency) => {
      const updated = requiredFormTemplates.map((r) =>
        r.templateId === templateId
          ? {
              ...r,
              frequency: newFrequency,
              validityDays: VALIDITY_REQUIRED_FREQUENCIES.includes(newFrequency)
                ? (r.validityDays ?? 365)
                : undefined,
            }
          : r,
      );
      try {
        await updateTreatment({
          organizationId,
          treatmentId,
          requiredFormTemplates: updated,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : t("common.error");
        toast.error(msg);
      }
    },
    [requiredFormTemplates, updateTreatment, organizationId, treatmentId, t],
  );

  const handleTimingChange = useCallback(
    async (
      templateId: Id<"formTemplates">,
      newTiming: RequiredFormTemplateTiming,
    ) => {
      const updated = requiredFormTemplates.map((r) =>
        r.templateId === templateId ? { ...r, timing: newTiming } : r,
      );

      try {
        await updateTreatment({
          organizationId,
          treatmentId,
          requiredFormTemplates: updated,
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : t("common.error");
        toast.error(msg);
      }
    },
    [requiredFormTemplates, updateTreatment, organizationId, treatmentId, t],
  );

  // --- Render ---

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {t(
              "documents.requiredDocs.title",
              "Wymagane dokumenty dla tego zabiegu",
            )}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {t(
              "documents.requiredDocs.description",
              "Te dokumenty zostana automatycznie wygenerowane przy tworzeniu wizyty",
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {requiredFormTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2 text-center">
              {t(
                "documents.requiredDocs.empty",
                "Brak wymaganych dokumentow. Kliknij ponizej, aby dodac.",
              )}
            </p>
          ) : (
            <div className="rounded-lg border divide-y">
              {requiredFormTemplates.map((req) => {
                const tpl = templateMap.get(req.templateId);
                const effectiveFrequency = req.frequency ?? (req.isOneTime ? "once" : "before_each_visit");
                const isRequired = req.isRequired ?? true;
                return (
                  <div
                    key={req.templateId}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block">
                          {tpl?.name ??
                            t("documents.requiredDocs.unknown", "Nieznany szablon")}
                        </span>
                        {req.validityDays && VALIDITY_REQUIRED_FREQUENCIES.includes(effectiveFrequency) && (
                          <span className="text-xs text-muted-foreground">
                            {t("documents.requiredDocs.validityDaysInfo", "Ważny {{days}} dni", { days: req.validityDays })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <TimingBadge
                        timing={req.timing}
                        onTimingChange={readOnly ? undefined : (newTiming) =>
                          handleTimingChange(req.templateId, newTiming)
                        }
                        t={t}
                      />
                      <FrequencyBadge
                        frequency={effectiveFrequency}
                        onFrequencyChange={readOnly ? undefined : (newFrequency) =>
                          handleFrequencyChange(req.templateId, newFrequency)
                        }
                        t={t}
                      />
                      {!isRequired && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-muted text-muted-foreground border-border"
                        >
                          {t("documents.requiredDocs.optional", "Opcjonalny")}
                        </Badge>
                      )}
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(req.templateId)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t(
                "documents.requiredDocs.add",
                "Dodaj wymagany dokument",
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); setAddDialogOpen(open); }}>
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

            <ScrollArea className="h-[200px]">
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
                {t("documents.requiredDocs.timing", "Moment wypełnienia")}
              </label>
              <Select
                value={selectedTiming}
                onValueChange={(v) =>
                  setSelectedTiming(v as RequiredFormTemplateTiming)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before_start">
                    {t("documents.requiredDocs.beforeStart", "Przed wizytą")}
                  </SelectItem>
                  <SelectItem value="during_visit">
                    {t("documents.requiredDocs.duringVisit", "W trakcie wizyty")}
                  </SelectItem>
                  <SelectItem value="after_completion">
                    {t("documents.requiredDocs.afterCompletion", "Po wizycie")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t("documents.requiredDocs.frequency", "Częstotliwość")}
              </label>
              <Select
                value={selectedFrequency}
                onValueChange={(v) => setSelectedFrequency(v as DocumentFrequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="before_each_visit">
                    {t("documents.requiredDocs.freq.beforeEachVisit", "Przed każdą wizytą")}
                  </SelectItem>
                  <SelectItem value="once">
                    {t("documents.requiredDocs.freq.once", "Jednorazowo (raz na pacjenta)")}
                  </SelectItem>
                  <SelectItem value="first_visit_only">
                    {t("documents.requiredDocs.freq.firstVisitOnly", "Tylko przy pierwszej wizycie")}
                  </SelectItem>
                  <SelectItem value="every_n_days">
                    {t("documents.requiredDocs.freq.everyNDays", "Raz na określony okres")}
                  </SelectItem>
                  <SelectItem value="on_expiry">
                    {t("documents.requiredDocs.freq.onExpiry", "Ponownie po wygaśnięciu")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {needsValidity && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("documents.requiredDocs.validityDays", "Ważność (dni)")}
                </label>
                <Input
                  type="number"
                  min={1}
                  value={selectedValidityDays}
                  onChange={(e) => setSelectedValidityDays(e.target.value)}
                  placeholder="365"
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    "documents.requiredDocs.validityDaysHint",
                    "Liczba dni, przez które podpisany dokument pozostaje ważny.",
                  )}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="is-required-detail-toggle" className="text-sm font-medium cursor-pointer">
                  {t("documents.requiredDocs.isRequired", "Wymagany")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "documents.requiredDocs.isRequiredDescription",
                    "Wymagane dokumenty blokują ukończenie wizyty. Opcjonalne są sugestią.",
                  )}
                </p>
              </div>
              <Switch
                id="is-required-detail-toggle"
                checked={selectedIsRequired}
                onCheckedChange={setSelectedIsRequired}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => { setAddDialogOpen(false); resetDialog(); }}
            >
              {t("common.cancel", "Anuluj")}
            </Button>
            <Button onClick={handleAdd} disabled={!selectedTemplateId}>
              {t("common.add", "Dodaj")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TIMING_ORDER: RequiredFormTemplateTiming[] = [
  "before_start",
  "during_visit",
  "after_completion",
];

const TIMING_STYLES: Record<RequiredFormTemplateTiming, string> = {
  before_start:
    "bg-green-100 text-green-800 border-green-200 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
  during_visit:
    "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  after_completion:
    "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
};

const FREQUENCY_ORDER: DocumentFrequency[] = [
  "before_each_visit",
  "once",
  "first_visit_only",
  "every_n_days",
  "on_expiry",
];

const FREQUENCY_STYLES: Record<DocumentFrequency, string> = {
  before_each_visit: "bg-muted text-muted-foreground border-border hover:bg-muted/80",
  once: "bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  first_visit_only: "bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800",
  every_n_days: "bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  on_expiry: "bg-red-100 text-red-800 border-red-200 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

function frequencyLabel(freq: DocumentFrequency, t: TFunction): string {
  switch (freq) {
    case "before_each_visit": return t("documents.requiredDocs.freq.beforeEachVisit", "Przed każdą wizytą");
    case "once": return t("documents.requiredDocs.freq.once", "Jednorazowo");
    case "first_visit_only": return t("documents.requiredDocs.freq.firstVisitOnly", "Pierwsza wizyta");
    case "every_n_days": return t("documents.requiredDocs.freq.everyNDays", "Raz na okres");
    case "on_expiry": return t("documents.requiredDocs.freq.onExpiry", "Po wygaśnięciu");
  }
}

function timingLabel(timing: RequiredFormTemplateTiming, t: TFunction): string {
  switch (timing) {
    case "before_start": return t("documents.requiredDocs.beforeStart", "Przed wizytą");
    case "during_visit": return t("documents.requiredDocs.duringVisit", "W trakcie wizyty");
    case "after_completion": return t("documents.requiredDocs.afterCompletion", "Po wizycie");
  }
}

function FrequencyBadge({
  frequency,
  onFrequencyChange,
  t,
}: {
  frequency: DocumentFrequency;
  onFrequencyChange?: (newFrequency: DocumentFrequency) => void;
  t: TFunction;
}) {
  const nextFrequency = (current: DocumentFrequency) => {
    const idx = FREQUENCY_ORDER.indexOf(current);
    return FREQUENCY_ORDER[(idx + 1) % FREQUENCY_ORDER.length];
  };

  if (!onFrequencyChange) {
    return (
      <Badge
        className={cn("text-xs select-none", FREQUENCY_STYLES[frequency])}
        variant="outline"
      >
        {frequencyLabel(frequency, t)}
      </Badge>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onFrequencyChange(nextFrequency(frequency))}
      className="cursor-pointer"
      title={t("documents.requiredDocs.toggleFrequency", "Kliknij, aby zmienić częstotliwość")}
    >
      <Badge
        className={cn("text-xs select-none", FREQUENCY_STYLES[frequency])}
        variant="outline"
      >
        {frequencyLabel(frequency, t)}
      </Badge>
    </button>
  );
}

function TimingBadge({
  timing,
  onTimingChange,
  t,
}: {
  timing: RequiredFormTemplateTiming;
  onTimingChange?: (newTiming: RequiredFormTemplateTiming) => void;
  t: TFunction;
}) {
  const nextTiming = (current: RequiredFormTemplateTiming) => {
    const idx = TIMING_ORDER.indexOf(current);
    return TIMING_ORDER[(idx + 1) % TIMING_ORDER.length];
  };

  if (!onTimingChange) {
    return (
      <Badge
        className={cn("text-xs select-none", TIMING_STYLES[timing])}
        variant="outline"
      >
        {timingLabel(timing, t)}
      </Badge>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onTimingChange(nextTiming(timing))}
      className="cursor-pointer"
      title={t("documents.requiredDocs.toggleTiming", "Kliknij, aby zmienic moment")}
    >
      <Badge
        className={cn("text-xs select-none", TIMING_STYLES[timing])}
        variant="outline"
      >
        {timingLabel(timing, t)}
      </Badge>
    </button>
  );
}

export type { TreatmentRequiredDocumentsProps, RequiredFormTemplate };
